# WhatIfStreet: location scenario simulator

WhatIfStreet and the Storyline canvas are one app (the **WhatIfStreet** tab in `components/app-shell.tsx`). The user picks a real street, a moment in the past or future, a "butterfly event" and the weather. The app writes a branching storyline of how that street changes, and each story beat can become an image (edited from the street's Street View photo) and then a video.

## Page layout (top to bottom)

| # | Section | Component |
| --- | --- | --- |
| 1 | Project header + tagline, ComfyUI online dot | `components/scenario/scenario-app.tsx` |
| 2 | Three-step instructions | `scenario-app.tsx` |
| 3 | Storyline canvas. Starts with four input nodes (location, time, butterfly event, environment); after a story is made they dock into a rail on the left | `components/storyline/storyline-canvas.tsx`, `components/scenario/input-nodes.tsx` |
| 4 | Status bar: what is selected and what can be done to it. When all four inputs are set it shows the big **Make your story** button | `components/scenario/selection-bar.tsx` |
| 5 | Detail panel, switched by the selected node: Street View navigator, time slider, butterfly options, environment options. For a story beat it shows that beat's keyframe and video | `components/scenario/detail-panel.tsx` |

Editors reused from the earlier WhatIfStreet: `components/whatifstreet/{street-view-picker,time-slider,butterfly-select,climate-select}.tsx`.

## Flow

1. Click each input node and set it. A node counts as set once the user has chosen something (for environment, "None" counts).
2. **Make your story** → `workflows/storyline.text.api.json` (text-only Gemini → `PreviewAny`) returns JSON; `parseStory` validates and repairs it; `fromJson` lays it out on the canvas.
3. Select a beat → **Generate keyframe** (`workflows/whatifstreet.image.api.json`) → **Make video** (`workflows/whatifstreet.video.api.json`).

Changing a starting point after a story exists keeps the story on screen but flags it out of date; **Remake your story** replaces it.

## Time model

The canvas timeline is log-scaled and only runs forward from Year 0 (see `lib/storyline.ts`), while the time slider is ±200 years. `storyFrame` in `lib/scenario.ts` reconciles them:

| Slider | Year 0 is | Story runs |
| --- | --- | --- |
| N years ahead | today | to N years ahead |
| N years ago | N years ago | forward to today (an alternate history) |
| Today | today | 10 years ahead |

Beat headers show the offset from today (`50 YR AGO`); the axis shows years since the start, with a caption saying what Year 0 means.

## Data model

A tree of beats (`StoryNode`: `parentId`, `text`, `year`, `y`, optional `keyframe` and `video`). X position is a pure function of `year`, so dragging a beat horizontally edits time; a beat is clamped between its parent and earliest child. See `lib/storyline.ts`. No graph library is used.

## Keyframes

Keyframes chain: a beat edits its nearest ancestor's keyframe; the first one edits the captured Street View photo (uploaded once per shot). The prompt is `buildGeminiPrompt` with the beat's text as `eventHint` and the offset from today as the time hint. Regenerating a keyframe clears that beat's video. Regenerating a parent does **not** invalidate children made from the old one.

## Files

| File | Role |
| --- | --- |
| `lib/scenario.ts` | Input kinds, `storyFrame`, `storyPrompt`, `parseStory` (pure, tested) |
| `lib/story-workflow.ts` | Node IDs + injector for the story workflow |
| `lib/storyline.ts` | Tree model, layout, time scale (pure, tested) |
| `lib/comfy.ts` | `queueStoryStage` / `trackStoryStage` plus the existing image and video stages |
| `workflows/storyline.text.api.json` | Story-writing Gemini prompt (asks for strict JSON, 7-11 beats, 1-2 branches) |
| `test/scenario.test.ts`, `test/storyline.test.ts` | Unit tests |

## Known limitations

- The UI has not been click-tested in a browser; the logic and ComfyUI stages are tested or were run live, the React components are only type-checked and built.
- One ComfyUI job at a time.
- The old "Render Video Path" (stitching a root-to-leaf path) was a mock and is gone. Video is now one real clip per beat. `planVideo` in `lib/storyline.ts` is kept for a future first/last-frame workflow but is unused.
- Story JSON from the model is repaired where safe (years out of order or past the horizon) and rejected otherwise (not JSON, a beat with no text, more than 16 beats).
- The story needs Gemini on the ComfyUI server; on Comfy Cloud it needs a paid plan (see the server settings dialog).
