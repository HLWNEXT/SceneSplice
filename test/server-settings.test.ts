import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLOUD_URL,
  isKeylessServer,
  keyHint,
  keylessServerUrl,
  normalizeUrl,
  parseSettings,
  resolveComfyTarget,
  resolveMapsKey,
  serializeSettings,
} from "../lib/server-settings.ts";

test("normalizeUrl keeps http(s) servers, drops trailing slashes, rejects everything else", () => {
  assert.equal(normalizeUrl("http://10.0.0.7:8188/"), "http://10.0.0.7:8188");
  assert.equal(normalizeUrl("  https://gpu.example.com/comfy// "), "https://gpu.example.com/comfy");
  assert.equal(normalizeUrl("file:///etc/passwd"), null);
  assert.equal(normalizeUrl("not a url"), null);
  assert.equal(normalizeUrl(""), null);
});

const KEYLESS_ENV = { COMFY_KEYLESS_URL: "http://10.0.0.7:8188/" };
const KEYLESS_SERVER_URL = "http://10.0.0.7:8188";

test("the keyless server comes from COMFY_KEYLESS_URL and is recognised however the user types it", () => {
  assert.equal(keylessServerUrl(KEYLESS_ENV), KEYLESS_SERVER_URL);
  assert.ok(isKeylessServer("http://10.0.0.7:8188", KEYLESS_ENV));
  assert.ok(isKeylessServer("http://10.0.0.7:8188/", KEYLESS_ENV));
  assert.ok(!isKeylessServer("http://10.0.0.8:8188", KEYLESS_ENV));
  assert.ok(!isKeylessServer(CLOUD_URL, KEYLESS_ENV));
  assert.ok(!isKeylessServer("http://10.0.0.7:8188", {}), "with no COMFY_KEYLESS_URL nothing is waived");
});

test("settings survive a cookie round trip and garbage cookies parse to empty settings", () => {
  const s = { mode: "cloud" as const, url: "http://10.0.0.5:8188", comfyKey: "k1", mapsKey: "m1", apiModels: true };
  assert.deepEqual(parseSettings(serializeSettings(s)), s);
  assert.deepEqual(parseSettings("%7Bnot json"), {});
  assert.deepEqual(parseSettings(undefined), {});
  assert.equal(parseSettings(serializeSettings({ mode: "evil" as any })).mode, undefined);
});

test("cloud mode targets cloud.comfy.org with the key as both X-API-Key and partner key", () => {
  const t = resolveComfyTarget({ mode: "cloud", comfyKey: "abc" }, {});
  assert.equal(t.baseUrl, CLOUD_URL);
  assert.equal(t.apiPrefix, "/api");
  assert.equal(t.xApiKey, "abc");
  assert.equal(t.partnerKey, "abc");
});

test("cloud mode falls back to COMFY_CLOUD_API_KEY from the environment", () => {
  assert.equal(resolveComfyTarget({ mode: "cloud" }, { COMFY_CLOUD_API_KEY: "envkey" }).xApiKey, "envkey");
  assert.equal(resolveComfyTarget({ mode: "cloud" }, {}).xApiKey, undefined);
});

test("the LAN server never receives a key, even if one is stored", () => {
  const t = resolveComfyTarget({ mode: "custom", url: KEYLESS_SERVER_URL, comfyKey: "abc" }, KEYLESS_ENV);
  assert.equal(t.apiPrefix, "");
  assert.equal(t.xApiKey, undefined);
  assert.equal(t.partnerKey, undefined);
});

test("other custom servers get the key as a partner key only, never as X-API-Key", () => {
  const t = resolveComfyTarget({ mode: "custom", url: "http://10.0.0.5:8188", comfyKey: "abc" }, {});
  assert.equal(t.baseUrl, "http://10.0.0.5:8188");
  assert.equal(t.xApiKey, undefined);
  assert.equal(t.partnerKey, "abc");
});

test("with nothing stored the target is the legacy COMFY_URL env var, then localhost", () => {
  assert.equal(resolveComfyTarget({}, { COMFY_URL: "http://10.0.0.7:8188/" }).baseUrl, KEYLESS_SERVER_URL);
  assert.equal(resolveComfyTarget({}, {}).baseUrl, "http://127.0.0.1:8188");
});

test("a stored Maps key wins over the environment", () => {
  assert.equal(resolveMapsKey({ mapsKey: "ui" }, { GOOGLE_MAPS_API_KEY: "env" }), "ui");
  assert.equal(resolveMapsKey({}, { GOOGLE_MAPS_API_KEY: "env" }), "env");
  assert.equal(resolveMapsKey({}, {}), undefined);
});

test("keyHint only reveals the last four characters", () => {
  assert.equal(keyHint("comfyui-abcdef123456"), "…3456");
  assert.equal(keyHint(undefined), null);
});
