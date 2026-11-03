import type { NextConfig } from "next";

// ComfyUI is proxied by app/comfy/[...path]/route.ts, which picks the server per request from the user's settings.
const nextConfig: NextConfig = {};

export default nextConfig;
