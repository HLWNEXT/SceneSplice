# Map White-Box Input Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address search -> OSM buildings as white boxes -> framed capture (shaded + depth) -> decay workflow.

**Architecture:** Pure OSM parsing/projection in `lib/geo.ts` (unit-tested). Thin Next.js API routes proxy Nominatim/Overpass. A three.js component renders the scene and captures two PNGs. `buildWorkflow` gets a `mode` that either wires or removes a depth ControlNet branch.

**Tech Stack:** Next.js, three.js, node:test.

---

### Task 1: OSM parsing and projection (`lib/geo.ts`)
- Create `lib/geo.ts`, `test/geo.test.ts`.
- Test first: height tag parsing (`"12"`, `"12 m"`), `building:levels` -> 3 m/level, default 10 m, projection to local meters, target-building detection (point in polygon, else nearest).
- Run: `npm test` (expect fail, then pass).
- Commit: `feat: add OSM building parsing`.

### Task 2: Geo API routes
- Create `app/api/geo/search/route.ts` (Nominatim) and `app/api/geo/buildings/route.ts` (Overpass, `out geom`), both with a User-Agent and 1 h cache; validate and clamp query params.
- Verify: `npm run build`.
- Commit: `feat: add geocoding and building API routes`.

### Task 3: White-box scene and capture
- `npm install three` and `npm install -D @types/three`.
- Create `lib/whitebox.ts` (extruded meshes, lights, shaded + depth capture) and `components/map-picker.tsx` (search box, results list, orbit canvas, exposes a `capture()` callback).
- Verify: `npm run build`.
- Commit: `feat: add 3D white-box map picker`.

### Task 4: Workflow modes
- Modify `workflows/decay.api.json`: depth LoadImage (40), ControlNetLoader (41), SetUnionControlNetType (42), ControlNetApplyAdvanced (43).
- Modify `lib/workflow.ts`: `mode: "upload" | "map"`, `depthName`; upload mode deletes nodes 40-43 and rewires the sampler; map mode feeds the sampler from node 43 and prefixes the prompt with a white-model-to-photo instruction.
- Extend `test/workflow.test.ts` for both modes.
- Commit: `feat: add map mode to the decay workflow`.

### Task 5: Studio integration
- Modify `lib/comfy.ts` (pass mode/depth) and `components/studio.tsx` (source toggle, map in preview area, capture + upload both images).
- Verify: `npm test`, `npm run build`, manual browser check.
- Commit: `feat: add map source to the studio`.
