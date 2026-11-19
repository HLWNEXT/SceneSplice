import assert from "node:assert/strict";
import test from "node:test";
import { authorizeUrl, challengeFor, newTxn, readAuthConfig, safeReturnTo, sessionFromIdToken, sign, verify } from "../lib/auth.ts";

const env = {
  AZURE_AD_TENANT_ID: "tenant-1",
  AZURE_AD_CLIENT_ID: "client-1",
  AZURE_AD_CLIENT_SECRET: "shh",
  AUTH_SECRET: "x".repeat(32),
};
const config = readAuthConfig(env)!;
const idToken = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const goodClaims = (now: number) => ({
  iss: "https://login.microsoftonline.com/tenant-1/v2.0",
  tid: "tenant-1",
  aud: "client-1",
  nonce: "n1",
  exp: Math.floor(now / 1000) + 3600,
  oid: "user-1",
  name: "Ada",
  preferred_username: "ada@example.com",
});

test("readAuthConfig needs every variable and a long secret", () => {
  assert.ok(config);
  assert.equal(readAuthConfig({ ...env, AZURE_AD_CLIENT_SECRET: "" }), null);
  assert.equal(readAuthConfig({ ...env, AUTH_SECRET: "short" }), null);
});

test("sign/verify round-trips and rejects tampering, wrong secret and expiry", () => {
  const now = Date.now();
  const token = sign({ exp: Math.floor(now / 1000) + 60, a: 1 }, config.secret);
  assert.equal(verify<{ exp: number }>(token, config.secret, now)?.exp, Math.floor(now / 1000) + 60);
  assert.equal(verify(token, "y".repeat(32), now), null);
  assert.equal(verify(token + "a", config.secret, now), null);
  assert.equal(verify(token, config.secret, now + 120_000), null);
  assert.equal(verify(undefined, config.secret), null);
});

test("safeReturnTo only allows local paths", () => {
  assert.equal(safeReturnTo("/app?x=1"), "/app?x=1");
  assert.equal(safeReturnTo("//evil.com"), "/app");
  assert.equal(safeReturnTo("https://evil.com"), "/app");
  assert.equal(safeReturnTo("/api/auth/logout"), "/app");
});

test("authorize URL carries PKCE challenge, state and nonce", () => {
  const txn = newTxn("/app");
  const u = new URL(authorizeUrl(config, txn, "http://127.0.0.1:3000/api/auth/callback"));
  assert.equal(u.pathname, "/tenant-1/oauth2/v2.0/authorize");
  assert.equal(u.searchParams.get("code_challenge"), challengeFor(txn.verifier));
  assert.equal(u.searchParams.get("state"), txn.state);
  assert.equal(u.searchParams.get("nonce"), txn.nonce);
});

test("sessionFromIdToken validates claims", () => {
  const now = Date.now();
  const s = sessionFromIdToken(idToken(goodClaims(now)), config, "n1", now);
  assert.deepEqual([s.sub, s.name, s.email], ["user-1", "Ada", "ada@example.com"]);
  for (const bad of [{ iss: "x" }, { tid: "other" }, { aud: "other" }, { nonce: "other" }, { exp: 1 }]) {
    assert.throws(() => sessionFromIdToken(idToken({ ...goodClaims(now), ...bad }), config, "n1", now));
  }
});
