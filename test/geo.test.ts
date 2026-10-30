import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOverpassQuery, parseBuildingHeight, parseOverpass, parseScenery } from "../lib/geo.ts";

const center = { lat: 40.0, lon: -74.0 };
// ~20 m square around the centre, plus a neighbour ~60 m east.
const sq = (lat: number, lon: number, d = 0.0001) => [
  { lat: lat - d, lon: lon - d },
  { lat: lat - d, lon: lon + d },
  { lat: lat + d, lon: lon + d },
  { lat: lat + d, lon: lon - d },
  { lat: lat - d, lon: lon - d },
];

test("parseBuildingHeight handles tags and fallbacks", () => {
  assert.equal(parseBuildingHeight({ height: "12" }), 12);
  assert.equal(parseBuildingHeight({ height: "12.5 m" }), 12.5);
  assert.equal(parseBuildingHeight({ "building:levels": "4" }), 12);
  assert.equal(parseBuildingHeight({ height: "tall", "building:levels": "2" }), 6);
  assert.equal(parseBuildingHeight({}), 10);
  assert.equal(parseBuildingHeight(undefined), 10);
});

test("parseOverpass projects to meters and flags the target", () => {
  const json = {
    elements: [
      { type: "way", id: 2, tags: { building: "yes" }, geometry: sq(40.0, -73.9992) },
      { type: "way", id: 1, tags: { building: "yes", height: "30" }, geometry: sq(40.0, -74.0) },
      { type: "node", id: 3 },
      { type: "way", id: 4, tags: { building: "yes" }, geometry: [{ lat: 40, lon: -74 }] },
    ],
  };
  const out = parseOverpass(json, center);
  assert.equal(out.length, 2);
  const target = out.find((b) => b.isTarget)!;
  assert.equal(target.id, 1);
  assert.equal(target.height, 30);
  // closing point dropped; 4 corners, about +-8.5 m in x for 0.0001 deg lon at 40N
  assert.equal(target.footprint.length, 4);
  const xs = target.footprint.map((p) => p[0]);
  assert.ok(Math.abs(Math.max(...xs) - 8.5) < 0.5);
  // north is -z
  const zs = target.footprint.map((p) => p[1]);
  assert.ok(Math.min(...zs) < 0 && Math.max(...zs) > 0);
  assert.equal(out.filter((b) => b.isTarget).length, 1);
});

test("target falls back to the nearest building when the point is outside all footprints", () => {
  const json = { elements: [{ type: "way", id: 9, tags: { building: "yes" }, geometry: sq(40.0003, -74.0) }] };
  assert.equal(parseOverpass(json, center)[0].isTarget, true);
});

test("buildOverpassQuery embeds radius and centre", () => {
  const q = buildOverpassQuery(40.1, -74.2, 250);
  assert.match(q, /around:250,40\.1,-74\.2/);
  assert.match(q, /out geom/);
});

test("parseScenery extracts roads and trees, and parseOverpass ignores them", () => {
  const json = {
    elements: [
      { type: "way", id: 5, tags: { highway: "residential" }, geometry: [{ lat: 40, lon: -74 }, { lat: 40.0001, lon: -74 }] },
      { type: "way", id: 6, tags: { highway: "proposed" }, geometry: [{ lat: 40, lon: -74 }, { lat: 40.0001, lon: -74 }] },
      { type: "node", id: 7, lat: 40.0001, lon: -74, tags: { natural: "tree" } },
    ],
  };
  const s = parseScenery(json, center);
  assert.equal(s.roads.length, 1);
  assert.equal(s.roads[0].width, 7);
  assert.equal(s.trees.length, 1);
  assert.ok(s.trees[0].z < 0);
  assert.equal(parseOverpass(json, center).length, 0);
});

test("building:part shapes replace their outline and carry the height", () => {
  const json = {
    elements: [
      { type: "way", id: 1, tags: { building: "yes" }, geometry: sq(40.0, -74.0) },
      { type: "way", id: 2, tags: { "building:part": "yes", height: "120" }, geometry: sq(40.00002, -74.0) },
    ],
  };
  const out = parseOverpass(json, center);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 2);
  assert.equal(out[0].height, 120);
  assert.equal(out[0].isTarget, true);
});

test("parseScenery fills parks with trees", () => {
  const park = { type: "way", id: 8, tags: { leisure: "park" }, geometry: sq(40.0, -74.0) };
  const s = parseScenery({ elements: [park] }, center);
  assert.equal(s.greens.length, 1);
  assert.ok(s.trees.length > 0);
});
