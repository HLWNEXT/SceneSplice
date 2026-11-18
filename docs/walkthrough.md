# Walkthrough: multi-scene interior film

The **Walkthrough** tab (`components/walkthrough/`) is the storyline idea applied to interiors. It uses the same canvas as WhatIfStreet (`components/storyline/storyline-canvas.tsx`), but each node is a **scene** with its own drawing instead of a story beat on a Street View photo.

## The canvas

- Every node is a scene. Its text is the scene's **animation prompt**: how its still image is brought to life (click to edit, same as a beat).
- **+** on a scene adds the next one. **+** on a link inserts a scene between two (use it for an in-between scene). Drag a scene to reorder it, drag the link handle onto a later scene to rewire, drag to a lower row and add a second child to **branch** into an alternative route.
- The horizontal axis is **time in the film, in seconds, 0:00 to 5:00**. Nodes can't be dragged or added past 5:00 (`MAX_FILM_SECONDS`, `SECONDS_AXIS` in `lib/walkthrough.ts`; the canvas takes the axis through `labels.axis`). The gap between two linked scenes is the length of the clip joining them, so spacing scenes further apart makes a longer clip.
- A readout under the canvas shows how far the timeline runs and the running time of the clips made on the selected route.
- A scene that has a frame (an uploaded rendered view, or a generated image) shows it on the node's header and in the frame strip under the canvas.
- The butterfly effect is off here (`labels.ripple = false`); the canvas takes a `labels` prop for wording and features that differ from the street storyline, so the street tab is unchanged.

## Flow

1. **Select a scene.** Its card appears under the canvas with a type:
   - **White-box view**: upload a drawing, write the **image prompt**, add up to 6 reference images, then **Generate image**.
   - **Rendered view**: the upload is the frame, no generation.
   - **In-between**: generated from the scene before it (its parent) and the scene after it (its first child), so both need a finished frame.
2. **Animation prompt** (the node's text): say how the still should move. Give the camera motion, what to animate, and how ("slow dolly toward the window, the sheer curtain stirs, dust drifts through the sunbeam"). Gemini turns it into the video prompt and is told to follow it; empty means the model chooses. The image prompt (what to render) and the animation prompt (how it moves) are separate boxes on the card.
3. **Make video** on any scene that has a parent: a first-frame / last-frame clip from the parent's frame to this one's, **as long as the timeline gap** between them (kept within what the model can make: 1 to 20 s on LTX, 4 to 15 s on Seedance).
4. **Animate this frame** on any scene that has a frame: a single-frame video that starts on that frame and animates it, guided by the animation prompt. Its length is the gap to the parent (the model's standard 3 s / 5 s for the first scene). It fills the same clip slot as Make video, so the latest one made is the one the film uses.
5. **Combine all videos** joins the clips of the **route**: from the first scene down to the selected scene, then on along the first branch to the end. Select a different scene to switch routes. The route is listed under the film.

A clip is flagged *out of date* when either of its frames is regenerated or replaced, the scene is re-linked under a different parent, or the timeline gap it was sized to changes (`videoStale`, from `transitionKey`, `singleKey` and the stored `gap`). A single-frame clip only depends on its own frame and gap. The optional **Design intent** text at the top is added to every image and video prompt.

## Data model

`lib/walkthrough.ts` keeps a `StoryTree` (structure, order, text, canvas position, handled entirely by the canvas and `lib/storyline.ts`) and a separate `SceneMap` keyed by node id for everything the canvas doesn't know about: mode, name, image prompt, drawing, references, render, clip. The node's own text is the animation prompt, and `year` on a node is its position on the timeline in seconds. A node with no entry is a blank white-box scene. `displayTree` overlays each scene's frame as the node's `keyframe` for drawing, and `pruneScenes` drops data for deleted nodes. Canvas placeholder text ("New story beat…", "Untitled scene…") is not treated as a prompt (`promptOf`).

## Export and import

**Export JSON** in the bar under the canvas saves the whole walkthrough (design intent, every scene's structure, timeline position and prompts, and references to the drawing, render, clip and film files on the ComfyUI server) as `walkthrough-<date>.json`. **Import JSON** loads one back, asking first if there is work on screen. Pictures and clips are *referenced*, not embedded, so the file is small but only shows its media while those files are still on the same ComfyUI server. The format is `lib/walkthrough-file.ts` (`app: "whatifstreet-walkthrough"`, version 1); a file with more than 24 scenes, a scene past 5:00, a loop or a missing parent is rejected with a message.

## How the models are used

| Step | Workflow | Notes |
| --- | --- | --- |
| White-box render, in-between frame | `workflows/api_nano_banana_pro.json` through `buildWalkthroughImageWorkflow` | Always Nano Banana Pro (an API node), because it takes several input images. Image 1 is the one being edited, the rest are references. At most 14 images. Needs the API key set in Settings. |
| Video prompt | `workflows/walkthrough.videoprompt.text.api.json` | Same graph and node ids as the street video-prompt writer, with an interior-film system prompt. If it fails, the clip still runs with `fallbackWalkthroughPrompt`. |
| Video | `ltx-2-5-flf2v.json` (two frames) or `whatifstreet.video.api.json`'s LTX image-to-video (one frame); `api_seedance2_5_flf2v.json` for either when **Use API models** is on | Same as WhatIfStreet. The clip length is passed in as the duration. |
| Final film | `lib/merge-video.ts`, prefix `walkthrough/film` | Clips must share a resolution. |

Uploaded images go to ComfyUI as soon as they are picked, and every later stage loads them by name.

## Files

| File | Role |
| --- | --- |
| `lib/walkthrough.ts` | Scene data, routes, readiness and staleness, prompt text (pure, tested) |
| `lib/walkthrough-file.ts` | Export / import of a walkthrough as JSON (pure, tested) |
| `lib/walkthrough-workflow.ts` | Multi-image Nano Banana Pro injector |
| `components/walkthrough/walkthrough-app.tsx` | State, one-job-at-a-time runner, generation calls, canvas wiring |
| `components/walkthrough/scene-card.tsx` | The selected scene's inputs, frame and clip |
| `components/storyline/storyline-canvas.tsx` | Shared canvas (`labels` prop) |
| `test/walkthrough.test.ts` | Unit tests |

## Known limitations

- Not click-tested in a browser yet; the logic and workflow builders are unit-tested, the components are only type-checked.
- Nothing is saved automatically: reloading loses the scenes (the files stay on the ComfyUI server). Use Export JSON to keep one.
- Making a clip from a lone scene needs **Animate this frame**; Make video always joins two frames.
- A single-frame clip of the first scene adds its own length (3 s / 5 s) on top of the timeline, so the film can run slightly past 5:00.
- An in-between scene uses its *first* child as the "after" frame; with branches, that is the upper branch.
- One ComfyUI job at a time.
- The Nano Banana Pro render path has not been run against a live server; the reference-image batch follows the `images.imageN` pattern already in `workflows/api_nano_banana_pro.json`.
