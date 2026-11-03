import { NextResponse } from "next/server";
import type { GeoResult } from "../../../../lib/geo";

const USER_AGENT = "SceneSplice/0.1 (open-source prototype)";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3 || q.length > 200) {
    return NextResponse.json({ error: "Enter at least 3 characters." }, { status: 400 });
  }
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, next: { revalidate: 3600 } }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: "Address search is unavailable." }, { status: 502 });
  const data: { display_name: string; lat: string; lon: string }[] = await res.json();
  const results: GeoResult[] = data.map((r) => ({ label: r.display_name, lat: Number(r.lat), lon: Number(r.lon) }));
  return NextResponse.json(results);
}
