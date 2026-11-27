import { makeApiKey, readToken } from "./apiKey.fixture.js";
import { readPlugin } from "./folder.js";
import { API_KEY_VARIABLE, publish, readApiKey } from "./publish.js";
import { copySample } from "./sample.fixture.js";

import { createHash, generateKeyPairSync } from "node:crypto";
import { type IncomingHttpHeaders, type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

/** What the registry answers to the next request. */
let answer: { status: number; body: string };
/** The requests the registry received, with the bytes of each body. */
let requests: {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  raw: Buffer;
  body: Record<string, unknown>;
}[];

let registry: Server;
let url: string;

beforeAll(async () => {
  registry = createServer(async (request, response) => {
    const { method, url, headers } = request;
    const raw = Buffer.concat(await request.toArray());
    requests.push({ method, url, headers, raw, body: JSON.parse(raw.toString()) });
    response.writeHead(answer.status).end(answer.body);
  });

  await new Promise<void>((resolve) => registry.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(registry.address() as AddressInfo).port}/v1/plugin/version`;
});

afterAll(() => void registry.close());

beforeEach(() => {
  answer = { status: 201, body: "" };
  requests = [];
});

const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("publish", () => {
  it("sends the whole current version in one request", async () => {
    const plugin = readPlugin(copySample());
    const { manifest } = plugin.versions.at(-1)!;

    expect(await publish(plugin, { url })).toEqual({ version: "1.1.0", published: true });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "POST", url: "/v1/plugin/version" });
    expect(requests[0]!.headers["content-type"]).toBe("application/json");
    expect(requests[0]!.body).toEqual({
      plugin: "sample",
      version: "1.1.0",
      schema: (manifest as { schema: unknown }).schema,
      exports: { beats: { name: "exports.beats", select: "$.beats[*]", id: "/id", label: "/title" } },
      ui: expect.stringContaining("export"),
      migration: expect.stringContaining("migrated"),
      languages: plugin.languages,
    });
  });

  it("leaves the migration and its digest out of a version that has none", async () => {
    const apiKey = makeApiKey();
    const plugin = readPlugin(copySample({ migrations: null, fixtures: null, "versions/1.0.0.yaml": null }));
    await publish(plugin, { url, apiKey: readApiKey({ [API_KEY_VARIABLE]: apiKey.pem }) });

    const { body } = requests[0]!;
    expect(body).not.toHaveProperty("migration");
    expect(readToken(body.proof as string, apiKey.publicKey).claims).not.toHaveProperty("migrationSHA256");
  });

  it("signs the bytes it sends and the modules of the version with the API key, and neither without one", async () => {
    const apiKey = makeApiKey();
    const plugin = readPlugin(copySample());
    const seconds = new Date("2026-11-26T12:00:00Z").getTime() / 1000;
    vi.useFakeTimers({ now: seconds * 1000, toFake: ["Date"] });
    onTestFinished(() => void vi.useRealTimers());

    await publish(plugin, { url, apiKey: readApiKey({ [API_KEY_VARIABLE]: apiKey.pem }) });
    await publish(plugin, { url, apiKey: readApiKey({}) });

    const [signed, open] = requests;
    const [scheme, token = ""] = signed!.headers.authorization!.split(" ");
    expect(scheme).toBe("Bearer");
    expect(readToken(token, apiKey.publicKey)).toEqual({
      header: { alg: "EdDSA", typ: "JWT", kid: apiKey.id },
      claims: {
        aud: "publish-narrative-engine-plugin",
        iat: seconds,
        exp: seconds + 300,
        bodySHA256: sha256(signed!.raw),
      },
    });
    const { ui, migration, proof } = signed!.body as Record<string, string>;
    expect(readToken(proof!, apiKey.publicKey)).toEqual({
      header: { alg: "EdDSA", typ: "proof+jwt", kid: apiKey.id },
      claims: {
        aud: "publish-narrative-engine-plugin",
        iat: seconds,
        plugin: "sample",
        version: "1.1.0",
        uiSHA256: sha256(ui!),
        migrationSHA256: sha256(migration!),
      },
    });
    expect(open!.headers.authorization).toBeUndefined();
    expect(open!.body).not.toHaveProperty("proof");

    const sent = JSON.stringify(signed!.headers) + signed!.raw.toString();
    for (const secret of apiKey.secrets) expect(sent).not.toContain(secret);
  });

  it.each([
    { name: "an empty value", key: () => "" },
    { name: "a cut private key", key: () => makeApiKey().pem.replace(/\n.{8}/, "\n") },
    {
      name: "an X25519 private key",
      key: () => generateKeyPairSync("x25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    },
  ])("refuses $name for an API key, naming the variable and quoting none of it", ({ key }) => {
    expect(() => readApiKey({ [API_KEY_VARIABLE]: key() })).toThrow(
      new Error("PLUGIN_PUBLISH_PRIVATE_KEY holds no Ed25519 private key in PEM.")
    );
  });

  it("publishes a prerelease of the current version", async () => {
    const published = await publish(readPlugin(copySample()), { url, prerelease: "dev.1" });

    expect(published).toEqual({ version: "1.1.0-dev.1", published: true });
    expect(requests[0]!.body).toMatchObject({ version: "1.1.0-dev.1", migration: expect.stringContaining("migrated") });
  });

  it("reads a conflict as a version the registry already holds", async () => {
    answer = { status: 409, body: "sample@1.1.0 exists" };

    expect(await publish(readPlugin(copySample()), { url })).toEqual({ version: "1.1.0", published: false });
  });

  it("fails on any other answer, with its status and its body", async () => {
    answer = { status: 422, body: '{"field":"schema"}' };

    await expect(publish(readPlugin(copySample()), { url })).rejects.toThrow(
      new Error('The registry answered 422: {"field":"schema"}')
    );
  });

  it("fails when the registry does not answer, with the reason", async () => {
    // Nothing listens on the port of a closed server.
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise((resolve) => closed.close(resolve));

    await expect(publish(readPlugin(copySample()), { url: `http://127.0.0.1:${port}` })).rejects.toThrow(
      new RegExp(`^The registry does not answer at http://127\\.0\\.0\\.1:${port}: .*ECONNREFUSED`)
    );
  });

  it("sends nothing when the plugin fails a check", async () => {
    const plugin = readPlugin(copySample({ "fixtures/1.1.0/outline.json": "[]", "i18n/fr.json": null }));

    await expect(publish(plugin, { url })).rejects.toThrow(
      new Error('fixtures/1.1.0/outline.json: /: Instance type "array" is invalid. Expected "object".')
    );
    expect(requests).toEqual([]);
  });
});
