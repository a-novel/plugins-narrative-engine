// An API key made for a test, and the registry's first check of its tokens (a-novel/.github#642).
import { type KeyObject, generateKeyPairSync, verify } from "node:crypto";

import { jwkThumbprint } from "@a-novel-kit/nodelib-server";

/** An API key made for one test. */
export interface TestApiKey {
  /** The private key in PEM, as the environment of a publisher holds it. */
  pem: string;
  /** The public key, as the registry holds it. */
  publicKey: KeyObject;
  /** The ID that every token names in `kid`: the JWK thumbprint of the public key. */
  id: string;
  /**
   * The private key as a leak would carry it: the base64 of the PEM, and the private scalar in
   * base64url, as a JWK holds it. Neither may appear in a request, a log or an error.
   */
  secrets: string[];
}

/** Makes an Ed25519 key pair, as a sysadmin makes a system API key. */
export function makeApiKey(): TestApiKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

  return {
    pem,
    publicKey,
    id: jwkThumbprint(publicKey.export({ format: "jwk" })),
    secrets: [pem.replace(/-----[A-Z ]+-----|\s/g, ""), privateKey.export({ format: "jwk" }).d!],
  };
}

/** Verifies the signature of a token against the public key, then returns its header and claims. */
export function readToken(token: string, publicKey: KeyObject): { header: unknown; claims: unknown } {
  const [header = "", claims = "", signature = ""] = token.split(".");
  if (!verify(null, Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, "base64url"))) {
    throw new Error("The signature of the token does not verify.");
  }

  const decode = (part: string): unknown => JSON.parse(Buffer.from(part, "base64url").toString());
  return { header: decode(header), claims: decode(claims) };
}
