// Google Street View Static API: URL building and param validation only. No network calls here
// (the API key must never reach the browser) — see app/api/streetview/route.ts for the fetches.

export type StreetViewParams = {
  lat: number;
  lon: number;
  heading?: number;
  pitch?: number;
  fov?: number;
  width?: number;
  height?: number;
};

export const DEFAULT_HEADING = 0;
export const DEFAULT_PITCH = 0;
export const DEFAULT_FOV = 90;
export const DEFAULT_WIDTH = 640;
export const DEFAULT_HEIGHT = 360;
export const MAX_SIZE = 640;
export const MIN_FOV = 10;
export const MAX_FOV = 120;
export const MIN_PITCH = -90;
export const MAX_PITCH = 90;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Headings wrap around a compass; everything else clamps to its valid range. */
export function normalizeHeading(h: number): number {
  const wrapped = h % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function sanitizeParams(p: StreetViewParams): Required<StreetViewParams> {
  return {
    lat: p.lat,
    lon: p.lon,
    heading: normalizeHeading(p.heading ?? DEFAULT_HEADING),
    pitch: clamp(p.pitch ?? DEFAULT_PITCH, MIN_PITCH, MAX_PITCH),
    fov: clamp(p.fov ?? DEFAULT_FOV, MIN_FOV, MAX_FOV),
    width: clamp(Math.round(p.width ?? DEFAULT_WIDTH), 1, MAX_SIZE),
    height: clamp(Math.round(p.height ?? DEFAULT_HEIGHT), 1, MAX_SIZE),
  };
}

function query(p: Required<StreetViewParams>, apiKey: string): string {
  return new URLSearchParams({
    location: `${p.lat},${p.lon}`,
    heading: String(p.heading),
    pitch: String(p.pitch),
    fov: String(p.fov),
    size: `${p.width}x${p.height}`,
    key: apiKey,
  }).toString();
}

/** Metadata requests are free and don't count against Street View Static API usage — check coverage before fetching an image. */
export function buildMetadataUrl(p: StreetViewParams, apiKey: string): string {
  return `https://maps.googleapis.com/maps/api/streetview/metadata?${query(sanitizeParams(p), apiKey)}`;
}

export function buildImageUrl(p: StreetViewParams, apiKey: string): string {
  return `https://maps.googleapis.com/maps/api/streetview?${query(sanitizeParams(p), apiKey)}`;
}
