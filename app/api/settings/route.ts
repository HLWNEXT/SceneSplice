import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_CUSTOM_URL,
  SETTINGS_COOKIE,
  isKeylessServer,
  keyHint,
  keylessServerUrl,
  normalizeUrl,
  parseSettings,
  resolveComfyTarget,
  resolveMapsKey,
  serializeSettings,
  type StoredSettings,
} from "../../../lib/server-settings";

// Reads and writes the user's server settings. Keys go into an httpOnly cookie and are never sent back
// to the browser — only a "…1234" hint and whether one is set.

function describe(stored: StoredSettings) {
  const target = resolveComfyTarget(stored, process.env);
  return {
    mode: target.kind,
    apiModels: !!stored.apiModels,
    url: target.kind === "custom" ? target.baseUrl : (stored.url ?? normalizeUrl(process.env.COMFY_URL) ?? DEFAULT_CUSTOM_URL),
    keylessUrl: keylessServerUrl(process.env) ?? "",
    keyWaived: target.kind === "custom" && isKeylessServer(target.baseUrl, process.env),
    comfyKey: { set: !!stored.comfyKey, hint: keyHint(stored.comfyKey), fromEnv: !!process.env.COMFY_CLOUD_API_KEY },
    mapsKey: { set: !!stored.mapsKey, hint: keyHint(stored.mapsKey), fromEnv: !!resolveMapsKey({}, process.env) },
  };
}

export async function GET(req: NextRequest) {
  const res = NextResponse.json(describe(parseSettings(req.cookies.get(SETTINGS_COOKIE)?.value)));
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** `undefined` keeps the stored value, "" clears it, anything else replaces it. */
function applyKey(current: string | undefined, incoming: unknown): string | undefined {
  if (incoming === undefined) return current;
  if (typeof incoming !== "string") return current;
  return incoming.trim().slice(0, 512) || undefined;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid settings." }, { status: 400 });

  const current = parseSettings(req.cookies.get(SETTINGS_COOKIE)?.value);
  const next: StoredSettings = { ...current };

  if (body.mode !== undefined) {
    if (body.mode !== "cloud" && body.mode !== "custom") return NextResponse.json({ error: "Unknown server mode." }, { status: 400 });
    next.mode = body.mode;
  }
  if (body.url !== undefined) {
    const url = normalizeUrl(body.url);
    if (body.url && !url) return NextResponse.json({ error: "Server URL must start with http:// or https://." }, { status: 400 });
    next.url = url ?? undefined;
  }
  if (typeof body.apiModels === "boolean") next.apiModels = body.apiModels || undefined;
  next.comfyKey = applyKey(current.comfyKey, body.comfyKey);
  next.mapsKey = applyKey(current.mapsKey, body.mapsKey);

  const res = NextResponse.json(describe(next));
  res.cookies.set(SETTINGS_COOKIE, serializeSettings(next), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
