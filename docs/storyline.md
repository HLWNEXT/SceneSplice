# Storyline canvas

A branching, node-based storytelling tool for planning how a building changes over time. Each node is a story beat pinned to a year; branches are alternative futures. Beats get keyframe images from ComfyUI, and a root-to-leaf path is meant to become a video.

Entry point: the **Storyline** tab in the app shell (`components/app-shell.tsx`).

## Files

| File | Role |
| --- | --- |
| `lib/storyline.ts` | Pure model: tree, time scale, layout, path tracing, prompt building, mock data. No React, no JSON imports, so it runs under `node --test`. |
| `components/storyline/storyline-canvas.tsx` | Client component: canvas, nodes, timeline axis, keyframe strip, toolbar, mock backends. |
| `test/storyline.test.ts` | Unit tests for the model (10 tests). |
| `lib/comfy.ts` (existing) | ComfyUI client reused for image upload, queueing and progress tracking. |

## Design decisions

### No graph library
The key constraint is that a node's X position is a function of its year. Graph libraries (React Flow etc.) own node positions, so this would mean fighting them. The canvas is plain React with pointer events and a CSS transform. No dependencies were added.

### Time is a log scale
`x = log10(1 + year) * 520px`. Each decade gets equal width, so Year 0, 10, 100 and 10,000 fit on one axis. The inverse (`xToYear`) turns a drag into a year, which is rounded to two significant figures so values read as `340`, not `338.17`.

- Dragging a node by its header changes its year; vertical position is free.
- A beat is clamped between its parent's year and its earliest child's year, so causality can't be reversed.
- Axis ticks: Year 0, 1, 10, 100, 1,000, 10,000, 100,000, plus minor ticks at 2-9 of each decade. Ticks, decade guide lines, node dots and the keyframe strip all use the same screen-space mapping as the canvas, so they stay aligned while panning and zooming.

### Data model: a tree with parent links
```ts
type StoryNode = { id; parentId: string | null; text; year; y; keyframe? }
type StoryTree = Record<string, StoryNode>
type StoryJson = { text; year; children?: StoryJson[] }   // nested import/export form
```
- A flat map with `parentId` makes edits, deletes and path tracing cheap. `fromJson` / `toJson` convert to and from the nested form, which is what an LLM returns and what the toolbar's **JSON** button copies.
- `fromJson` lays nodes out automatically: leaves take consecutive rows and parents are centered on their children.
- Deleting a node removes its whole subtree, so there are no orphans.
- It is a tree, not a general DAG. Each beat has one parent.

### Interaction
- Pan: drag the background. Zoom: mouse wheel, anchored on the cursor (0.2x-2x). **Fit** frames the whole tree.
- Node: click the text to edit; `+` on the right edge adds a child (one tick later, placed in the first free row so it doesn't overlap); the trash icon deletes the subtree; **Generate Keyframe** renders that beat.
- Selecting a node highlights its path back to the root.

### Keyframes (ComfyUI)
Keyframes use the existing WhatIfStreet image-stage workflow (`workflows/whatifstreet.image.api.json`: Gemini writes an edit description, FLUX applies it to an input image).

- Keyframes **chain**. The root beat edits the user's uploaded **Base photo**. Every other beat edits its nearest ancestor's keyframe (`keyframeSource`), falling back to the base photo. Generate from the root downward so each beat builds on the previous.
- The prompt (`buildPrompt`) tells the model to edit the photo keeping the building and camera framing, then states the year, the event, and the preceding history along the path.
- The result is stored as `keyframe: { prompt, image, file, generatedAt }`. `file` is the ComfyUI output reference used as the next beat's input.
- Thumbnails appear in the strip above the timeline at the beat's year.
- **Mock ComfyUI** (toolbar checkbox) swaps in generated SVG placeholders whose decay grows with year, for offline work.

### Storyline generation (mocked)
**Generate Storyline** calls `mockLlmStoryline`, which waits and returns a predefined `StoryJson`, then replaces the tree and re-fits the view.

### Video path (mocked)
**Render Video Path** requires a selected leaf node. It traces leaf to root (`planVideo`), refuses if any beat on the path has no keyframe, and pairs consecutive keyframes into segments (clip length grows with the log time jump). `mockLtxRender` then simulates progress and returns a fake output path.

## Backends and how to make them real

All external calls are isolated at the top of `storyline-canvas.tsx`:

| Function | Status | To make real |
| --- | --- | --- |
| Keyframe generation (inside `generateKeyframe`) | **Real** (ComfyUI) | Needs `COMFY_URL` in `.env.local` and a working Gemini node on the ComfyUI server. |
| `mockLlmStoryline` | Mock | Replace with an LLM call returning `StoryJson` (validate shape before `fromJson`). |
| `mockLtxRender` | Mock | Queue `workflows/whatifstreet.video.api.json` per segment via `queueVideoStage` / `trackVideoStage`, then stitch the clips. |

## Known limitations

- The video workflow takes a single image, so real video needs either one clip per keyframe or a new first/last-frame workflow. `planVideo` already produces first/last pairs for the latter.
- Regenerating a parent keyframe does not invalidate children generated from the old one.
- The canvas has not had a browser test pass beyond manual use; the model logic is covered by unit tests, the UI is not.
- The Gemini prompt wording is tuned for edits of a single photo and has not been tuned for storyline beats.
