import { NextResponse, type NextRequest } from "next/server";
import { SETTINGS_COOKIE, parseSettings, resolveMapsKey } from "../../../lib/server-settings";
import { buildImageUrl, buildMetadataUrl, type StreetViewParams } from "../../../lib/streetview";

function num(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const lat = num(p.get("lat"));
  const lon = num(p.get("lon"));
  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
  }
  const heading = num(p.get("heading"));
  const pitch = num(p.get("pitch"));
  const fov = num(p.get("fov"));
  if ([heading, pitch, fov].some((n) => n != null && Number.isNaN(n))) {
    return NextResponse.json({ error: "Invalid heading, pitch, or fov." }, { status: 400 });
  }

  const apiKey = resolveMapsKey(parseSettings(req.cookies.get(SETTINGS_COOKIE)?.value), process.env);
  if (!apiKey) return NextResponse.json({ error: "Street View needs a Google Maps API key — add one in Settings." }, { status: 500 });

  const params: StreetViewParams = { lat, lon, heading, pitch, fov };

  const meta = await fetch(buildMetadataUrl(params, apiKey)).catch(() => null);
  const metaData = await meta?.json().catch(() => null);
  if (!meta?.ok || metaData?.status !== "OK") {
    return NextResponse.json({ error: "No Street View imagery available here." }, { status: 404 });
  }

  const img = await fetch(buildImageUrl(params, apiKey)).catch(() => null);
  if (!img?.ok) return NextResponse.json({ error: "Street View image request failed." }, { status: 502 });

  const contentType = img.headers.get("content-type") ?? "image/jpeg";
  return new NextResponse(img.body, { headers: { "Content-Type": contentType, "Cache-Control": "no-store" } });
}
