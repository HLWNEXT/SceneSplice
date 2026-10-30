"use client";

import { Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseOverpass, parseScenery, type Building, type GeoResult, type Scenery } from "../lib/geo";
import { createWhiteboxView, type WhiteboxView } from "../lib/whitebox";

export type CaptureFn = () => Promise<{ image: File; depth: File }>;

type Props = {
  disabled?: boolean;
  /** Called with a capture function once buildings are loaded, or null when there is nothing to capture. */
  onCaptureReady: (capture: CaptureFn | null) => void;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function MapPicker({ disabled, onCaptureReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<WhiteboxView | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sceneRef = useRef<{ buildings: Building[]; scenery: Scenery } | null>(null);
  const [heightOverride, setHeightOverride] = useState("");

  useEffect(() => {
    const view = createWhiteboxView(canvasRef.current!);
    viewRef.current = view;
    return () => {
      view.dispose();
      viewRef.current = null;
      onCaptureReady(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyScene(override: string, keepCamera: boolean) {
    const scene = sceneRef.current;
    if (!scene) return;
    const h = parseFloat(override);
    const buildings =
      Number.isFinite(h) && h > 0 ? scene.buildings.map((b) => (b.isTarget ? { ...b, height: h } : b)) : scene.buildings;
    viewRef.current?.setScene(buildings, scene.scenery, keepCamera);
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setLoading(true);
    try {
      const found = await getJson<GeoResult[]>(`/api/geo/search?q=${encodeURIComponent(query)}`);
      setResults(found);
      if (found.length === 0) setError("No address found. Try adding the city or country.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function pick(r: GeoResult) {
    setResults([]);
    setError(null);
    setLoading(true);
    onCaptureReady(null);
    try {
      const raw = await getJson<Parameters<typeof parseOverpass>[0]>(`/api/geo/buildings?lat=${r.lat}&lon=${r.lon}&r=250`);
      const buildings = parseOverpass(raw, r);
      if (buildings.length === 0) {
        setError("No buildings found within 250 m of that address.");
        return;
      }
      sceneRef.current = { buildings, scenery: parseScenery(raw, r) };
      setHeightOverride("");
      applyScene("", false);
      setStatus(`${buildings.length} buildings · ${r.label.split(",").slice(0, 2).join(",")}`);
      onCaptureReady(async () => {
        const { shaded, depth } = await viewRef.current!.capture();
        return {
          image: new File([shaded], "whitebox.png", { type: "image/png" }),
          depth: new File([depth], "whitebox-depth.png", { type: "image/png" }),
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[720px] space-y-3">
      <form onSubmit={search} className="relative flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder="Search an address, e.g. 350 5th Ave, New York"
          aria-label="Address"
          className="min-w-0 flex-1 rounded-lg border border-edge bg-field px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={disabled || loading || query.trim().length < 3}
          className="flex items-center gap-2 rounded-lg border border-[#595b64] bg-[#292a30] px-3 py-2.5 text-sm font-semibold hover:bg-[#33343b] disabled:opacity-45"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Search
        </button>
        {results.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-edge bg-panel text-sm shadow-xl">
            {results.map((r) => (
              <li key={`${r.lat},${r.lon}`}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="block w-full px-3 py-2 text-left hover:bg-[#292a30]"
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="relative">
        <canvas ref={canvasRef} className="aspect-video w-full rounded-lg bg-[#c9d3dc]" />
        {!status && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-[#333]">
            Search an address to generate the white-box model.
          </p>
        )}
      </div>
      <p className="font-mono text-xs tracking-[0.08em] text-dim">
        {status ? `${status.toUpperCase()} · DRAG TO ORBIT, SCROLL TO ZOOM` : "WHITE-BOX MODEL · OPENSTREETMAP"}
      </p>
      {status && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-dim">
          Target building height (m)
          <input
            type="number"
            min={1}
            value={heightOverride}
            onChange={(e) => {
              setHeightOverride(e.target.value);
              applyScene(e.target.value, true);
            }}
            disabled={disabled}
            placeholder="from OpenStreetMap"
            className="w-36 rounded-lg border border-edge bg-field px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
          <span className="text-xs">OSM often has no height (defaults to 10 m); type one to correct it.</span>
        </label>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
