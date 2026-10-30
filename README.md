# DecayUI — "As-Ruined" (Entropy Studio)

Dark-mode web UI for an architectural decay simulator. Upload a pristine render, scrub the Chrono-Slider forward in time (10 → 10,000 years), pick an atmospheric condition, and generate an animated ruin video through a ComfyUI backend.

Stack: Next.js, React, Tailwind CSS v4, lucide-react.

## Run

```sh
npm install
cp .env.example .env.local
npm run dev     # http://127.0.0.1:3000
npm test        # typecheck
```

## Status

The UI talks to ComfyUI through a Next.js proxy at `/comfy` (set `COMFY_URL` in `.env.local`). The workflow in `workflows/decay.api.json` mirrors `workflows/image_flux_ltx25.json`, a graph already validated on the target server: FLUX Kontext edits the uploaded image into a ruined keyframe, then LTX-2.5 (22B distilled, with audio) animates it in a base pass + 2x latent-upscale refine pass. Node IDs the UI writes to are listed in `lib/workflow.ts`. There is no ControlNet/depth-guidance branch — map mode reuses the same FLUX/LTX path as upload mode, with an added prompt prefix telling FLUX the input is a white massing model to realize.

| Path | Purpose |
| --- | --- |
| `components/studio.tsx` | Page layout and simulate flow |
| `components/chrono-slider.tsx` | Log-scale time slider with snap points |
| `components/image-dropzone.tsx` | Drag-and-drop uploader with preview |
| `lib/decay.ts` | Slider value → FLUX prompt text mapping |
| `lib/comfy.ts` | ComfyUI client: upload, queue, progress, result, cancel |
| `lib/workflow.ts` | Injects UI values into the workflow JSON (upload or map mode) |
| `lib/geo.ts`, `app/api/geo/*` | Address search and OpenStreetMap building data |
| `lib/whitebox.ts`, `components/map-picker.tsx` | 3D white-box model and shaded/depth capture |

Originally based on Comfy-Org/comfy-reshoot (MIT, see `LICENSE` and `THIRD_PARTY_NOTICES/`).
