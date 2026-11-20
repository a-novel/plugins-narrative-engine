import { readPlugin } from "./folder.js";
import { publish } from "./publish.js";
import { copySample } from "./sample.fixture.js";

import { type IncomingHttpHeaders, type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/** What the registry answers to the next request. */
let answer: { status: number; body: string };
/** The requests the registry received. */
let requests: { method?: string; url?: string; headers: IncomingHttpHeaders; body: Record<string, unknown> }[];

let registry: Server;
let url: string;

beforeAll(async () => {
  registry = createServer(async (request, response) => {
    const { method, url, headers } = request;
    requests.push({ method, url, headers, body: JSON.parse(Buffer.concat(await request.toArray()).toString()) });
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

  it("leaves the migration out of a version that has none", async () => {
    await publish(readPlugin(copySample({ migrations: null, fixtures: null, "versions/1.0.0.yaml": null })), { url });

    expect(requests[0]!.body).not.toHaveProperty("migration");
  });

  it("sends the token as a bearer credential, and no credential without one", async () => {
    const plugin = readPlugin(copySample());

    await publish(plugin, { url, token: "publisher-token" });
    await publish(plugin, { url });

    expect(requests.map(({ headers }) => headers.authorization)).toEqual(["Bearer publisher-token", undefined]);
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
