"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GeoResult } from "../../lib/geo";
import { normalizeHeading } from "../../lib/streetview";

export type StreetViewCaptureFn = () => Promise<File>;

type Props = {
  disabled?: boolean;
  /** Called with a capture function whenever a usable frame is loaded, or null when there is nothing to capture.
   *  Fires again (with a new function) on every orientation change, so the caller should treat each non-null
   *  call as "the shot changed" and invalidate anything generated from the previous one. */
  onCaptureReady: (capture: StreetViewCaptureFn | null) => void;
  /** The address the user picked, so the caller can show it. Not called again on orientation changes. */
  onLocationChange?: (label: string) => void;
};

const HEADING_STEP = 30;
const PITCH_STEP = 15;
const MAX_PITCH = 60;
const MIN_PITCH = -60;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function StreetViewPicker({ disabled, onCaptureReady, onLocationChange }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [location, setLocation] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [heading, setHeading] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearchError(null);
    setSearching(true);
    try {
      const found = await getJson<GeoResult[]>(`/api/geo/search?q=${encodeURIComponent(query)}`);
      setResults(found);
      if (found.length === 0) setSearchError("No address found. Try adding the city or country.");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }

  function pick(r: GeoResult) {
    setResults([]);
    setSearchError(null);
    setHeading(0);
    setPitch(0);
    setLocation({ lat: r.lat, lon: r.lon, label: r.label });
    onLocationChange?.(r.label);
  }

  // Fetch (or re-fetch on orientation change) whenever location/heading/pitch settle.
  useEffect(() => {
    if (!location) {
      onCaptureReady(null);
      return;
    }
    const ctrl = new AbortController();
    setLoadingPhoto(true);
    setPhotoError(null);
    onCaptureReady(null);
    const q = new URLSearchParams({ lat: String(location.lat), lon: String(location.lon), heading: String(heading), pitch: String(pitch) });
    fetch(`/api/streetview?${q}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Street View request failed (${res.status})`);
        }
        return res.blob();
      })
      .then((blob) => {
        if (ctrl.signal.aborted) return;
        blobRef.current = blob;
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        onCaptureReady(async () => new File([blob], "streetview.jpg", { type: blob.type || "image/jpeg" }));
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setPhotoError(err instanceof Error ? err.message : String(err));
        setPreviewUrl(null);
        onCaptureReady(null);
      })
      .finally(() => !ctrl.signal.aborted && setLoadingPhoto(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, heading, pitch]);

  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);
  useEffect(() => () => onCaptureReady(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const adjustHeading = (delta: number) => setHeading((h) => normalizeHeading(h + delta));
  const adjustPitch = (delta: number) => setPitch((p) => Math.min(MAX_PITCH, Math.max(MIN_PITCH, p + delta)));

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
          disabled={disabled || searching || query.trim().length < 3}
          className="flex items-center gap-2 rounded-none border border-stage-line bg-stage-well px-3 py-2.5 font-serif text-sm font-semibold text-stage-dim hover:border-accent hover:text-on-accent disabled:opacity-45"
        >
          {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Search
        </button>
        {results.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-none border border-stage-line bg-stage-well font-serif text-sm text-stage-dim shadow-xl">
            {results.map((r) => (
              <li key={`${r.lat},${r.lon}`}>
                <button type="button" onClick={() => pick(r)} className="block w-full px-3 py-2 text-left hover:bg-stage hover:text-on-accent">
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="relative">
        <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-none border border-stage-line bg-stage-well">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Street View" className="size-full object-cover" />
          ) : loadingPhoto ? (
            <Loader2 size={24} className="animate-spin text-stage-dim" />
          ) : (
            <p className="max-w-[380px] px-6 text-center font-serif text-sm text-stage-dim">
              {photoError ?? "Search an address to load the Street View photo."}
            </p>
          )}
        </div>
        {previewUrl && (
          <div className="absolute bottom-3 right-3 grid grid-cols-3 gap-1 border border-stage-line bg-stage-well/80 p-1.5 backdrop-blur">
            <div />
            <button
              type="button"
              disabled={disabled || loadingPhoto}
              onClick={() => adjustPitch(PITCH_STEP)}
              aria-label="Tilt up"
              className="border border-stage-line bg-stage p-1.5 text-stage-dim hover:border-accent hover:text-on-accent disabled:opacity-45"
            >
              <ChevronUp size={14} />
            </button>
            <div />
            <button
              type="button"
              disabled={disabled || loadingPhoto}
              onClick={() => adjustHeading(-HEADING_STEP)}
              aria-label="Rotate left"
              className="border border-stage-line bg-stage p-1.5 text-stage-dim hover:border-accent hover:text-on-accent disabled:opacity-45"
            >
              <ChevronLeft size={14} />
            </button>
            <div />
            <button
              type="button"
              disabled={disabled || loadingPhoto}
              onClick={() => adjustHeading(HEADING_STEP)}
              aria-label="Rotate right"
              className="border border-stage-line bg-stage p-1.5 text-stage-dim hover:border-accent hover:text-on-accent disabled:opacity-45"
            >
              <ChevronRight size={14} />
            </button>
            <div />
            <button
              type="button"
              disabled={disabled || loadingPhoto}
              onClick={() => adjustPitch(-PITCH_STEP)}
              aria-label="Tilt down"
              className="border border-stage-line bg-stage p-1.5 text-stage-dim hover:border-accent hover:text-on-accent disabled:opacity-45"
            >
              <ChevronDown size={14} />
            </button>
            <div />
          </div>
        )}
      </div>
      <p className="plaque-label text-xs text-stage-dim">
        {location ? `${location.label.split(",").slice(0, 2).join(",")} · Heading ${heading}° · Pitch ${pitch}°` : "Google Street View"}
      </p>
      {searchError && <p className="font-serif text-sm text-stage-oxide">{searchError}</p>}
    </div>
  );
}
