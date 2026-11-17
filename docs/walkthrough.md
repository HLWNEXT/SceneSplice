# Walkthrough: multi-scene interior film

The **Walkthrough** tab (`components/walkthrough/`) is the storyline idea applied to interiors. It uses the same canvas as WhatIfStreet (`components/storyline/storyline-canvas.tsx`), but each node is a **scene** with its own drawing instead of a story beat on a Street View photo.

## The canvas

- Every node is a scene. Its text is the scene's prompt (click to edit, same as a beat).
- **+** on a scene adds the next one. **+** on a link inserts a scene between two (use it for an in-between scene). Drag a scene to reorder it, drag the link handle onto a later scene to rewire, drag to a lower row and add a second child to **branch** into an alternative route.
- Horizontal position is only the order and spacing of the walk (the axis is unitless, labelled "Position"). It has no effect on clip length.
- A scene that has a frame (an uploaded rendered view, or a generated image) shows it on the node's header and in the frame strip under the canvas.
- The butterfly effect is off here (`labels.ripple = false`); the canvas takes a `labels` prop for wording and features that differ from the street storyline, so the street tab is unchanged.

## Flow

1. **Select a scene.** Its card appears under the canvas with a type:
   - **White-box view**: upload a drawing, write the prompt (the node's text), add up to 6 reference images, then **Generate image**.
   - **Rendered view**: the upload is the frame, no generation.
   - **In-between**: generated from the scene before it (its parent) and the scene after it (its first child), so both need a finished frame.
2. **Make video** on any scene that has a parent: a first-frame / last-frame clip from the parent's frame to this one's.
3. **Combine all videos** joins the clips of the **route**: from the first scene down to the selected scene, then on along the first branch to the end. Select a different scene to switch routes. The route is listed under the film.

A clip is flagged *out of date* when either of its frames is regenerated or replaced, or the scene is re-linked under a different parent (`videoStale`, from `transitionKey`). The optional **Design intent** text at the top is added to every image and video prompt.

## Data model

`lib/walkthrough.ts` keeps a `StoryTree` (structure, order, text, canvas position, handled entirely by the canvas and `lib/storyline.ts`) and a separate `SceneMap` keyed by node id for everything the canvas doesn't know about: mode, name, drawing, references, render, clip. A node with no entry is a blank white-box scene. `displayTree` overlays each scene's frame as the node's `keyframe` for drawing, and `pruneScenes` drops data for deleted nodes. Canvas placeholder text ("New story beat…", "Untitled scene…") is not treated as a prompt (`promptOf`).

## How the models are used

| Step | Workflow | Notes |
| --- | --- | --- |
| White-box render, in-between frame | `workflows/api_nano_banana_pro.json` through `buildWalkthroughImageWorkflow` | Always Nano Banana Pro (an API node), because it takes several input images. Image 1 is the one being edited, the rest are references. At most 14 images. Needs the API key set in Settings. |
| Video prompt | `workflows/walkthrough.videoprompt.text.api.json` | Same graph and node ids as the street video-prompt writer, with an interior-film system prompt. If it fails, the clip still runs with `fallbackWalkthroughPrompt`. |
| Video | `ltx-2-5-flf2v.json`, or `api_seedance2_5_flf2v.json` when **Use API models** is on | Same as WhatIfStreet. |
| Final film | `lib/merge-video.ts`, prefix `walkthrough/film` | Clips must share a resolution. |

Uploaded images go to ComfyUI as soon as they are picked, and every later stage loads them by name.

## Files

| File | Role |
| --- | --- |
| `lib/walkthrough.ts` | Scene data, routes, readiness and staleness, prompt text (pure, tested) |
| `lib/walkthrough-workflow.ts` | Multi-image Nano Banana Pro injector |
| `components/walkthrough/walkthrough-app.tsx` | State, one-job-at-a-time runner, generation calls, canvas wiring |
| `components/walkthrough/scene-card.tsx` | The selected scene's inputs, frame and clip |
| `components/storyline/storyline-canvas.tsx` | Shared canvas (`labels` prop) |
| `test/walkthrough.test.ts` | Unit tests |

## Known limitations

- Not click-tested in a browser yet; the logic and workflow builders are unit-tested, the components are only type-checked.
- Nothing is saved: reloading loses the scenes (the files stay on the ComfyUI server). There is no import / export like the storyline has.
- A clip always joins two frames, so a lone scene can't make a video.
- An in-between scene uses its *first* child as the "after" frame; with branches, that is the upper branch.
- One ComfyUI job at a time.
- The Nano Banana Pro render path has not been run against a live server; the reference-image batch follows the `images.imageN` pattern already in `workflows/api_nano_banana_pro.json`.
