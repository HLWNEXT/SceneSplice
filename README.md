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

UI scaffold only. `lib/comfy.ts` is a **mock**: each function documents the real ComfyUI endpoint it will call (`/upload/image`, `/prompt`, `/ws` or `/history`, `/view`).

| Path | Purpose |
| --- | --- |
| `components/studio.tsx` | Page layout and simulate flow |
| `components/chrono-slider.tsx` | Log-scale time slider with snap points |
| `components/image-dropzone.tsx` | Drag-and-drop uploader with preview |
| `lib/decay.ts` | Slider value → FLUX prompt text mapping |
| `lib/comfy.ts` | Placeholder ComfyUI client |

Originally based on Comfy-Org/comfy-reshoot (MIT, see `LICENSE` and `THIRD_PARTY_NOTICES/`).
