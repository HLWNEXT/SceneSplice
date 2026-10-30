import type { NextConfig } from "next";

const comfyUrl = (process.env.COMFY_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Proxy ComfyUI through the app so the browser doesn't need CORS access to it.
  async rewrites() {
    return [{ source: "/comfy/:path*", destination: `${comfyUrl}/:path*` }];
  },
};

export default nextConfig;
