# WhatIfStreet — design

## Goal
A second mode alongside the existing decay simulator: pick a real street via Google Street View, choose a point in time (past or future), pick a "butterfly action" (a counterfactual decision) and an optional weather/climate condition, and generate an AI-imagined photo and video clip of that street under those conditions.

## Decisions
- **Additive, not a replacement.** The existing decay simulator ("As-Ruined") is untouched. A top-level mode toggle (same pattern as today's `source` radio buttons, one level up) switches between "Decay Studio" and "WhatIfStreet" on the same page. No new routes.
- **Street View source:** Google Street View **Static API** only (`GOOGLE_MAPS_API_KEY` in `.env.local`, server-side only, proxied through a new `/api/streetview` route — the key never reaches the browser). Always today's current imagery; no historical Street View data is used. Address search keeps using the existing free Nominatim `/api/geo/search` route; the resolved lat/lon is handed to Street View Static API's `location` param, which snaps to the nearest panorama.
- **Orientation:** the Static API returns a single flat image at a given heading/pitch/fov — there's no free orbit like the 3D white-box model. The user adjusts heading (left/right) and pitch (up/down) with simple controls that re-fetch the route at the new angle, to frame the shot before locking it in.
- **Time travel is 100% generative, both directions.** The "past" is never a real archived photo — Gemini/FLUX imagine it from the current photo, same as the future. (Google's Map Tiles API can expose real historical panoramas for some locations back to ~2015, but that path was explicitly rejected for complexity/scope — see conversation history, not re-litigated here.)
- **Time slider:** bidirectional, ±200 years, log-scale mirrored around a "Today" center, reusing the `yearsToLog`/`logToYears` mechanic from `lib/decay.ts`. Labeled stops: 200/50/10 yr ago, Today, 10/50/200 yr ahead. The slider never gets injected into a prompt directly — it only hands Gemini a time hint (e.g. "150 years in the future").
- **Butterfly action:** a curated list of ~8 scenarios (energy/climate/tech/policy/society pivots), single-select, plus a "write your own" free-text option.
- **Weather/climate:** a new curated list, separate from the decay mode's disaster-flavored `ATMOSPHERES` (which stays untouched), optional (defaults to "None"), plus a custom-text option.
- **Pipeline is split into two separately-queued ComfyUI graphs**, so the generated image is a real, independently reviewable/redo-able artifact rather than an internal intermediate the way it is in the decay flow today:
  1. **Image stage** — `GeminiNode` (streetview photo + system prompt + a user prompt built from the time hint, butterfly text, weather text) → its text output wired directly into FLUX's `CLIPTextEncode` node inside the same graph → FLUX edits the photo → `SaveImage`.
  2. **Video stage** — the saved image → `LoadImage` → the existing LTX half of the graph → `SaveVideo`.
- **Tabs:** Street View → Image → Video, in that order. A tab is disabled until its prerequisite artifact exists. Changing any upstream input (address, orientation, time, butterfly action, weather) immediately clears the downstream image/video rather than leaving a stale result visible — no "regenerate to catch up" limbo state.
- **Naming:** the feature/brand name is "WhatIfStreet."

## Flow
1. Mode toggle: "Decay Studio" / "WhatIfStreet."
2. **Street View tab:** address search (Nominatim, existing) → pick a result → `/api/streetview` fetches the default-heading photo → heading/pitch controls refine the framing → lock in.
3. **Image tab** (disabled until a street view is locked in): pick time (slider), butterfly action (list or custom), weather (list, custom, or none) → "Generate" uploads the street view photo and queues the Image-stage graph → Gemini synthesizes a FLUX edit prompt from the inputs → FLUX produces the edited photo → shown here, downloadable, regenerable (new seed) without re-touching the Street View tab.
4. **Video tab** (disabled until an image exists): "Generate" queues the Video-stage graph from the current image → LTX produces the motion clip → shown here, downloadable.
5. Going back and changing anything upstream clears whichever tabs depended on it.

## Components
- `lib/streetview.ts` — pure Static API URL builder (location/heading/pitch/fov/size), unit-tested.
- `app/api/streetview/route.ts` — server route, injects `GOOGLE_MAPS_API_KEY`, proxies image bytes.
- `lib/timetravel.ts` — bidirectional time stages/labels (mirrors `lib/decay.ts`).
- `lib/butterfly.ts` — curated butterfly-action list + custom-text type.
- `lib/climate.ts` — curated weather/climate list + custom-text type + "None."
- `workflows/whatifstreet.image.api.json` — Gemini + FLUX graph, derived from `api_google_gemini_i2t.json` + the FLUX half of `image_flux_ltx25.json`, with `SaveImage` added.
- `workflows/whatifstreet.video.api.json` — the LTX half of `image_flux_ltx25.json`, `LoadImage` repointed at the image-stage output.
- `lib/whatifstreet-workflow.ts` — node-id maps and `buildImageWorkflow`/`buildVideoWorkflow` injectors, same pattern as `lib/workflow.ts`.
- `lib/comfy.ts` — extended with stage-aware queue/track helpers (two graphs instead of one).
- `components/whatifstreet/*.tsx` — mode shell, tab bar, street-view picker + orientation controls, time slider, butterfly select, weather select, image/video result panes.

## Errors
- No Street View coverage at a location → inline message (Street View Static API returns a documented "no imagery" placeholder/zero-results status; surface that, don't silently show a generic grey tile).
- Google API quota/billing error → surfaced the same way `ComfyError` surfaces ComfyUI failures today.
- Gemini/FLUX/LTX node or execution errors → same `/history` error-surfacing pattern as the existing decay flow.

## Testing
- Unit tests (pure logic, `node:test`, fixtures): `lib/streetview.ts` URL building, `lib/timetravel.ts` slider math, `lib/whatifstreet-workflow.ts` node injection (same shape as `test/workflow.test.ts`'s "every link points at an existing node" + injection checks).
- `/api/streetview` is tested live against the real Google API (the sandbox this plan was written in confirmed network access and that the provided key works for the Street View Static API).
- The two new ComfyUI graphs (`whatifstreet.image.api.json`, `whatifstreet.video.api.json`) **cannot be live-tested from the environment this plan was written in** — the ComfyUI server (`<your-comfyui-host>:8188`) is only reachable from the user's own network. Each graph gets a structural unit test (dangling-link check) plus an explicit manual checkpoint for the user to run (`npm run dev`, queue a real prompt) before the next task starts.

## Out of scope
Real historical Street View imagery (Map Tiles API), free-roam 3D orbit for street view framing, a dedicated route/URL for this mode, editing/approving the Gemini-produced prompt text before it reaches FLUX.
