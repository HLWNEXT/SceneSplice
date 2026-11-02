"use client";

import { Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseOverpass, type GeoResult } from "../lib/geo";
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
      viewRef.current?.setBuildings(buildings);
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
          className="min-w-0 flex-1 rounded-none border border-stage-line bg-stage-well px-3 py-2.5 font-serif text-sm text-stage-dim outline-none placeholder:text-stage-dim/60 focus:border-accent"
        />
        <button
          type="submit"
          disabled={disabled || loading || query.trim().length < 3}
          className="flex items-center gap-2 rounded-none border border-stage-line bg-stage-well px-3 py-2.5 font-serif text-sm font-semibold text-stage-dim hover:border-accent hover:text-on-accent disabled:opacity-45"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Search
        </button>
        {results.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-none border border-stage-line bg-stage-well font-serif text-sm text-stage-dim shadow-xl">
            {results.map((r) => (
              <li key={`${r.lat},${r.lon}`}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="block w-full px-3 py-2 text-left hover:bg-stage hover:text-on-accent"
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="relative">
        <canvas ref={canvasRef} className="aspect-video w-full rounded-none bg-[#d8cba3]" />
        {!status && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center font-serif text-sm text-ink">
            Search an address to generate the white-box model.
          </p>
        )}
      </div>
      <p className="plaque-label text-xs text-stage-dim">
        {status ? `${status} · Drag to orbit, scroll to zoom` : "White-box model · OpenStreetMap"}
      </p>
      {error && <p className="font-serif text-sm text-stage-oxide">{error}</p>}
    </div>
  );
}
