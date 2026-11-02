import assert from "node:assert/strict";
import { test } from "node:test";
import { buildImageUrl, buildMetadataUrl, normalizeHeading, sanitizeParams } from "../lib/streetview.ts";

test("normalizeHeading wraps into 0-360", () => {
  assert.equal(normalizeHeading(0), 0);
  assert.equal(normalizeHeading(400), 40);
  assert.equal(normalizeHeading(-30), 330);
  assert.equal(normalizeHeading(-390), 330);
});

test("sanitizeParams fills defaults and clamps out-of-range values", () => {
  const p = sanitizeParams({ lat: 40.7, lon: -73.9 });
  assert.equal(p.heading, 0);
  assert.equal(p.pitch, 0);
  assert.equal(p.fov, 90);
  assert.equal(p.width, 640);
  assert.equal(p.height, 360);

  const clamped = sanitizeParams({ lat: 40.7, lon: -73.9, pitch: 999, fov: 1, width: 5000, height: -10 });
  assert.equal(clamped.pitch, 90);
  assert.equal(clamped.fov, 10);
  assert.equal(clamped.width, 640);
  assert.equal(clamped.height, 1);
});

test("buildImageUrl and buildMetadataUrl embed sanitized params and the key, never a raw unclamped value", () => {
  const img = buildImageUrl({ lat: 40.7, lon: -73.9, heading: 370, fov: 500 }, "KEY123");
  assert.match(img, /^https:\/\/maps\.googleapis\.com\/maps\/api\/streetview\?/);
  assert.match(img, /location=40\.7%2C-73\.9/);
  assert.match(img, /heading=10\b/);
  assert.match(img, /fov=120\b/);
  assert.match(img, /key=KEY123/);

  const meta = buildMetadataUrl({ lat: 40.7, lon: -73.9 }, "KEY123");
  assert.match(meta, /^https:\/\/maps\.googleapis\.com\/maps\/api\/streetview\/metadata\?/);
});
