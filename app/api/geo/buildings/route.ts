import { NextResponse } from "next/server";
import { buildOverpassQuery } from "../../../../lib/geo";

const USER_AGENT = "SceneSplice/0.1 (HLW NEXT competition prototype)";
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const lat = Number(p.get("lat"));
  const lon = Number(p.get("lon"));
  const radius = Math.min(500, Math.max(50, Number(p.get("r") ?? 250)));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
  }
  const body = new URLSearchParams({ data: buildOverpassQuery(lat, lon, radius) });
  for (const endpoint of ENDPOINTS) {
    const res = await fetch(endpoint, {
      method: "POST",
      body,
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 3600 },
    }).catch(() => null);
    if (res?.ok) return NextResponse.json(await res.json());
  }
  return NextResponse.json({ error: "Building data is unavailable. Try again shortly." }, { status: 502 });
}
