# WhatIfStreet Implementation Plan

**Status (2026-11-01):** Tasks 1-6 implemented. Tasks 1, 3, 4 live-verified end to end (real Street View fetch, real Gemini+FLUX image edit, real LTX video) against the user's ComfyUI server. Task 6 (UI) passes build/typecheck and server-renders without error, but has **not** been click-tested in an actual browser — no browser-automation tool was available in the implementing environment. That's the one open item before calling this done.

**Goal:** Street View address input -> time/butterfly-action/weather selection -> Gemini-written FLUX edit prompt -> edited image -> LTX video, as a second mode alongside the existing decay simulator, with tabs for Street View / Image / Video.

**Architecture:** see `2026-11-01-whatifstreet-design.md` for the full decision record. In short: Street View Static API (new `/api/streetview` route, server-side key), a bidirectional time slider mirroring `lib/decay.ts`'s log-scale math, curated butterfly-action and weather lists, and the generation pipeline split into two separately-queued ComfyUI graphs (Image stage: Gemini+FLUX; Video stage: LTX) instead of the decay flow's single combined graph.

**Tech Stack:** Next.js, node:test, ComfyUI (custom `GeminiNode`, FLUX Kontext, LTX-2.5).

**Constraint:** the ComfyUI server (`172.16.34.152:8188`) is on the user's own network and is not reachable from the environment these tasks are being implemented in. Tasks 3 and 4 (the two ComfyUI graphs) cannot be live-tested by the agent — each has a manual checkpoint for the user to run (`npm run dev`, queue a real prompt against their own server) before the next task starts. Everything else (Street View API, pure logic) is live-tested directly since that network is reachable.

---

### Task 1: Street View Static API
- Create `lib/streetview.ts`: pure builder for the Static API image URL and the metadata-check URL (`location`/`heading`/`pitch`/`fov`/`size`), plus `test/streetview.test.ts`.
- Create `app/api/streetview/route.ts`: GET route, validates/clamps params, calls the metadata endpoint first (surface "no imagery here" distinctly from a generic error), then proxies the image bytes. `GOOGLE_MAPS_API_KEY` stays server-side.
- **Quick test (live, done before writing the route):** confirmed the provided key works — `GET streetview/metadata?location=40.748817,-73.985428` returned `"status":"OK"` with a `pano_id`.
- Verify: `npm test`, then a live `curl` of the new route.
- Commit: `feat: add Google Street View static API route`.

### Task 2: Time-travel domain data
- Create `lib/timetravel.ts`: `TIME_STAGES` (±200/±50/±10 yr, "Today"), bidirectional `yearsToLog`/`logToYears`/`snapLog`/`nearestStage` analogs, a `timeHint(offsetYears)` formatter for the Gemini prompt (e.g. "150 years in the past").
- Create `lib/butterfly.ts`: `BUTTERFLY_ACTIONS` (~8 curated entries) + a `{ custom: string }` escape hatch type.
- Create `lib/climate.ts`: `CLIMATE_CONDITIONS` (curated, includes a "None" entry) + the same custom-text escape hatch.
- `test/timetravel.test.ts`: slider math mirrors `test/decay.test.ts`-style coverage (none exists yet for `lib/decay.ts` — add equivalent coverage for the new bidirectional version).
- Commit: `feat: add time-travel slider, butterfly-action, and climate data`.

### Task 3: Image-stage workflow (Gemini + FLUX)
- Export `workflows/whatifstreet.image.api.json` from the FLUX half of `image_flux_ltx25.json` (nodes `395`, `405`/`406` as needed, `407:*`) plus the `GeminiNode`/`LoadImage` pair from `api_google_gemini_i2t.json`, wiring Gemini's text output directly into `407:6` (`CLIPTextEncode`) instead of today's literal string. Add a `SaveImage` node on the FLUX decode output (`407:8`).
- Extend `lib/whatifstreet-workflow.ts` (new file, same pattern as `lib/workflow.ts`): `NODE_IMAGE` map, `buildImageWorkflow({ imageName, systemPrompt, userPrompt, seed })` — `userPrompt` is assembled from the time hint + butterfly text + climate text.
- `test/whatifstreet-workflow.test.ts`: dangling-link check (same as `workflow.test.ts`'s first test) + injection assertions, run against the new JSON.
- **Manual checkpoint (user, against their own ComfyUI):** queue this graph once with a sample uploaded photo and confirm a `SaveImage` output shows up in `/history` before Task 4 starts. Do not proceed until this is confirmed.
- Commit: `feat: add Gemini+FLUX image-stage workflow`.

### Task 4: Video-stage workflow (LTX)
- Export `workflows/whatifstreet.video.api.json` from the LTX half of `image_flux_ltx25.json` (the `398_*` nodes + `75` `SaveVideo`), with `LoadImage` (`395`) now meant to load the image-stage's `SaveImage` output instead of a user upload.
- Extend `lib/whatifstreet-workflow.ts`: `NODE_VIDEO` map, `buildVideoWorkflow({ imageName, motionPrompt, seed })`.
- Extend `test/whatifstreet-workflow.test.ts` for the video template.
- **Manual checkpoint (user):** queue this graph with a test image and confirm a video lands in `/history` before Task 5 starts.
- Commit: `feat: add LTX video-stage workflow`.

### Task 5: Two-stage ComfyUI client
- Extend `lib/comfy.ts`: generalize `queuePrompt`/`trackProgress` (or add stage-specific variants) to queue the image-stage graph and resolve a `SaveImage` output, then separately queue the video-stage graph with that output's filename and resolve a `SaveVideo` output. Two `NODE_PROGRESS` maps (one per stage).
- Verify: `npm test`, `npm run build`.
- Commit: `feat: add two-stage image/video ComfyUI client`.

### Task 6: WhatIfStreet UI
- `components/whatifstreet/street-view-picker.tsx`: address search (reuses `/api/geo/search`), calls `/api/streetview`, heading/pitch controls.
- `components/whatifstreet/time-slider.tsx`, `butterfly-select.tsx`, `climate-select.tsx`: built on `lib/timetravel.ts`/`lib/butterfly.ts`/`lib/climate.ts`.
- `components/whatifstreet/studio.tsx`: tab bar (Street View / Image / Video) with gating + upstream-change invalidation as specified in the design doc; wires the above into Task 5's client.
- `components/studio.tsx` (existing): add the top-level "Decay Studio" / "WhatIfStreet" mode toggle.
- Verify: `npm test`, `npm run build`, manual end-to-end browser check (requires the user's ComfyUI to be reachable).
- Commit: `feat: add WhatIfStreet UI`.
