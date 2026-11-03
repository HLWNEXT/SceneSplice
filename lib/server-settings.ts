// User-configurable server settings (ComfyUI target + Google Maps key). Stored in an httpOnly cookie so
// the browser can't read the keys back, yet <img>/<video> requests to /comfy/view still carry them.
// Pure logic only — the cookie/route plumbing lives in app/api/settings and app/comfy.

export const CLOUD_URL = "https://cloud.comfy.org";
/**
 * The team's LAN ComfyUI server. Its backend already holds the Comfy API key (for Gemini and other
 * partner nodes), so no key is ever sent to it.
 */
export const KEYLESS_SERVER_URL = "http://172.16.34.152:8188";
export const DEFAULT_CUSTOM_URL = "http://127.0.0.1:8188";
export const SETTINGS_COOKIE = "decayui_settings";

export type ServerMode = "cloud" | "custom";
export type StoredSettings = { mode?: ServerMode; url?: string; comfyKey?: string; mapsKey?: string; apiModels?: boolean };

export type ComfyTarget = {
  kind: ServerMode;
  baseUrl: string;
  /** Path prefix the server's API lives under ("/api" on Comfy Cloud, none on a ComfyUI server). */
  apiPrefix: "" | "/api";
  /** Sent as the X-API-Key header. Only ever set for Comfy Cloud. */
  xApiKey?: string;
  /** Injected into /prompt as extra_data.api_key_comfy_org so partner nodes (Gemini) can bill the account. */
  partnerKey?: string;
};

/** http(s) origin + path with no trailing slash, or null if it isn't a usable server URL. */
export function normalizeUrl(raw: string | undefined | null): string | null {
  const s = raw?.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
}

export function isKeylessServer(url: string | undefined | null): boolean {
  return normalizeUrl(url) === KEYLESS_SERVER_URL;
}

const clean = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function parseSettings(cookieValue: string | undefined): StoredSettings {
  if (!cookieValue) return {};
  try {
    const raw = JSON.parse(decodeURIComponent(cookieValue));
    return {
      mode: raw.mode === "cloud" || raw.mode === "custom" ? raw.mode : undefined,
      url: normalizeUrl(raw.url) ?? undefined,
      comfyKey: clean(raw.comfyKey),
      mapsKey: clean(raw.mapsKey),
      apiModels: raw.apiModels === true ? true : undefined,
    };
  } catch {
    return {};
  }
}

export function serializeSettings(s: StoredSettings): string {
  return encodeURIComponent(JSON.stringify(s));
}

/** The slice of process.env this module reads; any env-like record satisfies it. */
type Env = Readonly<Record<string, string | undefined>>;

/** Where ComfyUI requests should go. With nothing stored this is the legacy env-var behaviour. */
export function resolveComfyTarget(s: StoredSettings, env: Env): ComfyTarget {
  if (s.mode === "cloud") {
    const key = s.comfyKey ?? clean(env.COMFY_CLOUD_API_KEY);
    return { kind: "cloud", baseUrl: CLOUD_URL, apiPrefix: "/api", xApiKey: key, partnerKey: key };
  }
  const baseUrl = s.url ?? normalizeUrl(env.COMFY_URL) ?? DEFAULT_CUSTOM_URL;
  // A custom server isn't Comfy Cloud, so the key is never sent as X-API-Key — only offered to the
  // partner nodes. The known LAN server has its own, so nothing is sent there at all.
  const partnerKey = isKeylessServer(baseUrl) ? undefined : (s.comfyKey ?? clean(env.COMFY_CLOUD_API_KEY));
  return { kind: "custom", baseUrl, apiPrefix: "", partnerKey };
}

export function resolveMapsKey(s: StoredSettings, env: Env): string | undefined {
  return s.mapsKey ?? clean(env.GOOGLE_MAPS_API_KEY);
}

/** "…a3b" — enough for the user to recognise a key without exposing it. */
export function keyHint(key: string | undefined): string | null {
  return key ? `…${key.slice(-4)}` : null;
}
