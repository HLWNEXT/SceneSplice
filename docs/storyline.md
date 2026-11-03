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
3. Select a beat → **Generate keyframe** (`workflows/whatifstreet.image.api.json`) → **Make video** (see Video below).

Changing a starting point after a story exists keeps the story on screen but flags it out of date; **Remake your story** replaces it.

## Time model

The canvas timeline is linear and only runs forward from Year 0 (see `lib/storyline.ts`), while the time slider is ±200 years. `storyFrame` in `lib/scenario.ts` reconciles them:

| Slider | Year 0 is | Story runs |
| --- | --- | --- |
| N years ahead | today | to N years ahead |
| N years ago | N years ago | forward to today (an alternate history) |
| Today | today | 10 years ahead |

Beat headers show the offset from today (`50 YR AGO`); the axis shows time since the start, with a caption saying what Year 0 means.

### Time scale vs node size

The canvas has two independent zooms:

- **Time scale** (pixels per year): mouse wheel, anchored on the date under the cursor. Beats spread apart or together; nodes keep their pixel size.
- **Node size**: the *Node size* slider or Ctrl+wheel. Scales nodes and row spacing only; beats never move along the timeline.

`year` may be fractional. The axis picks its unit from the scale (`3 mo`, `1 yr`, `1,000 yr`) and shows month ticks once zoomed in. Dragging snaps to the finest visible grid step, so zooming in unlocks quarters, then months. Months are the finest unit; offsets under a year render as `6 MO AHEAD` and `6 months in the future` in headers and prompts.

## Data model

A tree of beats (`StoryNode`: `parentId`, `text`, `year`, `y`, optional `keyframe` and `video`). X position is a pure function of `year` and the time scale, so dragging a beat horizontally edits time; a beat is clamped between its parent and earliest child. See `lib/storyline.ts`. No graph library is used.

## Keyframes

Keyframes chain: a beat edits its nearest ancestor's keyframe; the first one edits the captured Street View photo (uploaded once per shot). The prompt is `buildGeminiPrompt` with the beat's text as `eventHint` and the offset from today as the time hint. Regenerating a keyframe clears that beat's video. Regenerating a parent does **not** invalidate children made from the old one.

## Video

**Make video** always runs two ComfyUI jobs:

1. **Prompt layer** (`workflows/videoprompt.text.api.json`): Gemini looks at the keyframe(s) and the story text and writes the prompt, adding a little motion and one small event, plus ambient sound (LTX 2.5 generates audio). `buildVideoPromptWorkflow` hands it two images (first, then last, via `ImageBatch`) or one. If this step fails the video still runs, with `fallbackVideoPrompt` (the beat text plus gentle ambient motion), and the status bar says so.
2. **Video**:
   - If the beat has an earlier keyframe on its path (`previousKeyframeNode`), it runs `workflows/ltx-2-5-flf2v.json` (LTX 2.5 first-frame / last-frame): first frame = the previous keyframe, last frame = the selected keyframe.
   - Otherwise (typically the first beat) it runs the single-image LTX workflow `workflows/whatifstreet.video.api.json`.

The flf2v file is used exactly as exported from ComfyUI; `buildFlf2vWorkflow` only sets the two frames, the prompt and the seed (node ids in `NODE_FLF2V`). It also switches the template's built-in LTX prompt enhancer **off**, because Gemini has already written the prompt from both frames and a second rewrite only blurs it. Clip length is `VIDEO_SECONDS` (3 s, set in `lib/whatifstreet-workflow.ts` and applied to both video paths, since generation time grows steeply with length); 1280x720 and 24 fps come from the templates. The chosen prompt and mode are kept on the node (`videoMeta`) and shown under the video.

## API models

Settings (gear) has a **Use API models** switch. Off (default): keyframes use FLUX and videos use LTX 2.5 on the ComfyUI server. On: keyframes run `workflows/api_nano_banana_pro.json` (Nano Banana Pro edits the photo straight from the scene description, no separate prompt-writer job) and videos run `workflows/api_seedance2_5_flf2v.json` (Seedance 2.5, `API_VIDEO_SECONDS` = 5 s). With no earlier keyframe, Seedance starts on the selected keyframe and the last-frame input is dropped. The story and video-prompt steps use Gemini either way. The switch lives in the settings cookie and applies to WhatIfStreet only; Decay Studio is unchanged.

## Files

| File | Role |
| --- | --- |
| `lib/scenario.ts` | Input kinds, `storyFrame`, `storyPrompt`, `parseStory` (pure, tested) |
| `lib/story-workflow.ts` | Node IDs + injector for the story workflow |
| `lib/storyline.ts` | Tree model, layout, time scale (pure, tested) |
| `lib/comfy.ts` | `queueStoryStage` / `trackStoryStage` plus the existing image and video stages |
| `lib/video-prompt.ts` | Video prompt layer: request text, workflow injector, reply cleanup, fallback (pure, tested) |
| `workflows/videoprompt.text.api.json` | Gemini video-prompt writer (sees the keyframe(s)) |
| `workflows/ltx-2-5-flf2v.json` | LTX 2.5 first/last-frame video (API format, used as exported) |
| `workflows/storyline.text.api.json` | Story-writing Gemini prompt (asks for strict JSON, 7-11 beats, 1-2 branches) |
| `test/scenario.test.ts`, `test/storyline.test.ts` | Unit tests |

## Known limitations

- The UI has not been click-tested in a browser; the logic and ComfyUI stages are tested or were run live, the React components are only type-checked and built.
- One ComfyUI job at a time.
- A video's first frame is the nearest earlier keyframe on the path, not necessarily the beat directly before it. Regenerating that earlier keyframe does not invalidate videos already made from it.
- The old "Render Video Path" (stitching a root-to-leaf path) was a mock and is gone. Video is now one real clip per beat. `planVideo` in `lib/storyline.ts` is kept for a future first/last-frame workflow but is unused.
- Story JSON from the model is repaired where safe (years out of order or past the horizon) and rejected otherwise (not JSON, a beat with no text, more than 16 beats).
- The story needs Gemini on the ComfyUI server; on Comfy Cloud it needs a paid plan (see the server settings dialog).
