import type { NextRequest } from "next/server";
import { adaptWorkflowForCloud, jobToHistory } from "../../../lib/comfy-cloud";
import { SETTINGS_COOKIE, parseSettings, resolveComfyTarget, type ComfyTarget } from "../../../lib/server-settings";

// Proxies /comfy/* to whichever ComfyUI server the user picked in Settings (a self-hosted server or
// Comfy Cloud), so the browser never needs CORS access or sees an API key. Replaces the old static
// rewrite in next.config.ts, which could only ever point at one server chosen at build time.

const json = (body: unknown, status: number) => Response.json(body, { status });

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  if (path.some((seg) => seg === ".." || seg === ".")) return json({ error: "Bad path." }, 400);
  const sub = `/${path.join("/")}`;

  const target = resolveComfyTarget(parseSettings(req.cookies.get(SETTINGS_COOKIE)?.value), process.env);
  if (target.kind === "cloud" && !target.xApiKey) {
    return json({ error: { message: "Comfy Cloud needs an API key — add one in Settings." } }, 401);
  }

  const headers = new Headers();
  for (const h of ["content-type", "range", "accept"]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (target.xApiKey) headers.set("X-API-Key", target.xApiKey);

  try {
    if (target.kind === "cloud" && req.method === "GET" && sub.startsWith("/history/")) {
      return await cloudHistory(target, sub.slice("/history/".length), headers);
    }
    if (target.kind === "cloud" && req.method === "GET" && sub === "/view") {
      return await cloudView(target, req.nextUrl.search, headers);
    }

    let body: BodyInit | undefined;
    if (req.method === "POST") {
      body = sub === "/prompt" ? await promptBody(req, target) : await req.arrayBuffer();
    }
    const upstream = await fetch(`${target.baseUrl}${target.apiPrefix}${sub}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
    });
    return relay(upstream);
  } catch {
    return json({ error: { message: `Cannot reach ${target.kind === "cloud" ? "Comfy Cloud" : target.baseUrl}.` } }, 502);
  }
}

/** Adds the partner-node key (Gemini etc.) and, on cloud, swaps in nodes the cloud actually has. */
async function promptBody(req: NextRequest, target: ComfyTarget): Promise<string> {
  const payload = await req.json();
  if (target.kind === "cloud" && payload?.prompt) payload.prompt = adaptWorkflowForCloud(payload.prompt);
  if (target.partnerKey) payload.extra_data = { ...payload.extra_data, api_key_comfy_org: target.partnerKey };
  return JSON.stringify(payload);
}

/** Cloud has no /history/{id}; ask for the job and present it in the local shape. */
async function cloudHistory(target: ComfyTarget, promptId: string, headers: Headers): Promise<Response> {
  const res = await fetch(`${target.baseUrl}/api/jobs/${encodeURIComponent(promptId)}`, { headers, cache: "no-store" });
  if (res.status === 404) return json({}, 200);
  if (!res.ok) return relay(res);
  return json(jobToHistory(promptId, await res.json()), 200);
}

/** Cloud answers /view with a 302 to a signed storage URL. Hand that to the browser instead of the key. */
async function cloudView(target: ComfyTarget, search: string, headers: Headers): Promise<Response> {
  const res = await fetch(`${target.baseUrl}/api/view${search}`, { headers, redirect: "manual", cache: "no-store" });
  const location = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && location) return Response.redirect(location, 302);
  return relay(res);
}

function relay(upstream: Response): Response {
  const headers = new Headers();
  for (const h of ["content-type", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  // fetch() already decoded any content-encoding, so the upstream length would be wrong for those.
  const length = upstream.headers.get("content-length");
  if (length && !upstream.headers.get("content-encoding")) headers.set("content-length", length);
  headers.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export { handle as GET, handle as POST, handle as DELETE };
