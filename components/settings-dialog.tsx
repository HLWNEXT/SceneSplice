"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

type KeyState = { set: boolean; hint: string | null; fromEnv: boolean };
type Loaded = {
  mode: "cloud" | "custom";
  url: string;
  keylessUrl: string;
  comfyKey: KeyState;
  mapsKey: KeyState;
};

const inputClass = "w-full rounded-none border border-edge bg-field px-3 py-2 font-mono text-xs text-ink placeholder:text-dim";
const sameUrl = (a: string, b: string) => a.trim().replace(/\/+$/, "") === b.replace(/\/+$/, "");

function KeyField({
  label,
  hint,
  state,
  value,
  onChange,
  onRemove,
  disabled,
}: {
  label: string;
  hint: string;
  state: KeyState;
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="plaque-label text-xs text-dim">{label}</span>
      <div className="mt-1 flex gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={state.set ? `Saved (${state.hint}) — type to replace` : state.fromEnv ? "Using the server's environment value" : "Not set"}
          className={`${inputClass} disabled:opacity-45`}
        />
        {state.set && !disabled && (
          <button type="button" onClick={onRemove} className="plaque-label shrink-0 rounded-none border border-edge bg-field px-3 text-[11px] text-ink hover:bg-panel">
            Remove
          </button>
        )}
      </div>
      <span className="mt-1 block font-serif text-xs italic text-dim">{hint}</span>
    </label>
  );
}

export function SettingsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mode, setMode] = useState<"cloud" | "custom">("custom");
  const [url, setUrl] = useState("");
  const [comfyKey, setComfyKey] = useState("");
  const [mapsKey, setMapsKey] = useState("");
  const [removeComfy, setRemoveComfy] = useState(false);
  const [removeMaps, setRemoveMaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Loaded) => {
        setLoaded(s);
        setMode(s.mode);
        setUrl(s.url);
      })
      .catch(() => setResult({ ok: false, text: "Couldn't load current settings." }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const keyWaived = mode === "custom" && !!loaded && sameUrl(url, loaded.keylessUrl);

  async function save() {
    setBusy(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = { mode, url: mode === "custom" ? url : undefined };
      if (comfyKey.trim()) body.comfyKey = comfyKey.trim();
      else if (removeComfy) body.comfyKey = "";
      if (mapsKey.trim()) body.mapsKey = mapsKey.trim();
      else if (removeMaps) body.mapsKey = "";

      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save settings.");
      setLoaded(data);
      setComfyKey("");
      setMapsKey("");
      setRemoveComfy(false);
      setRemoveMaps(false);

      // /system_stats is public on Comfy Cloud, so /user is the call that actually checks the key.
      const probe = await fetch(mode === "cloud" ? "/comfy/user" : "/comfy/system_stats", { cache: "no-store" });
      if (probe.ok) setResult({ ok: true, text: mode === "cloud" ? "Saved. Connected to Comfy Cloud." : "Saved. ComfyUI server is reachable." });
      else if (probe.status === 401) setResult({ ok: false, text: "Saved, but Comfy Cloud rejected the API key." });
      else setResult({ ok: false, text: `Saved, but the server didn't respond (${probe.status}).` });
      onSaved();
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "Couldn't save settings." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 p-4 sm:pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="w-full max-w-[520px] rounded-none border border-edge bg-panel p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="settings-title" className="font-display text-2xl italic text-ink">
            Settings
          </h2>
          <button type="button" onClick={onClose} aria-label="Close settings" className="text-dim hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <fieldset className="mt-5" disabled={busy}>
          <legend className="plaque-label text-xs text-dim">ComfyUI server</legend>
          <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="ComfyUI server">
            {([
              ["cloud", "Comfy Cloud"],
              ["custom", "Custom server"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mode === id}
                onClick={() => setMode(id)}
                className={`plaque-label rounded-none border px-3 py-2 text-xs ${mode === id ? "border-accent bg-accent text-on-accent" : "border-edge bg-field text-ink hover:bg-panel"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 space-y-4">
          {mode === "custom" ? (
            <label className="block">
              <span className="plaque-label text-xs text-dim">Server URL</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:8188" spellCheck={false} className={`${inputClass} mt-1`} />
            </label>
          ) : (
            <p className="font-serif text-sm italic text-dim">Runs on cloud.comfy.org. Needs a paid Comfy Cloud plan with API access.</p>
          )}

          {keyWaived ? (
            <p className="border border-edge bg-field px-3 py-2 font-serif text-sm italic text-dim">No API key needed — this server already has one configured.</p>
          ) : (
            <KeyField
              label={mode === "cloud" ? "Comfy Cloud API key" : "Comfy API key (optional)"}
              hint={mode === "cloud" ? "Sent as X-API-Key, and passed to Gemini and other partner nodes." : "Only passed to partner nodes such as Gemini. Leave empty if the server has its own."}
              state={loaded?.comfyKey ?? { set: false, hint: null, fromEnv: false }}
              value={comfyKey}
              onChange={setComfyKey}
              onRemove={() => {
                setRemoveComfy(true);
                setComfyKey("");
                setLoaded((l) => (l ? { ...l, comfyKey: { ...l.comfyKey, set: false, hint: null } } : l));
              }}
              disabled={busy}
            />
          )}

          <KeyField
            label="Google Maps API key"
            hint="Used for Street View in WhatIfStreet. Stays on this app's server."
            state={loaded?.mapsKey ?? { set: false, hint: null, fromEnv: false }}
            value={mapsKey}
            onChange={setMapsKey}
            onRemove={() => {
              setRemoveMaps(true);
              setMapsKey("");
              setLoaded((l) => (l ? { ...l, mapsKey: { ...l.mapsKey, set: false, hint: null } } : l));
            }}
            disabled={busy}
          />
        </div>

        {result && (
          <p role="status" className={`mt-4 font-serif text-sm italic ${result.ok ? "text-sage" : "text-oxide"}`}>
            {result.text}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="plaque-label rounded-none border border-edge bg-field px-4 py-2 text-xs text-ink hover:bg-panel">
            Close
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !loaded}
            className="plaque-label rounded-none border border-accent bg-accent px-4 py-2 text-xs text-on-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? "Saving…" : "Save & test"}
          </button>
        </div>
      </div>
    </div>
  );
}
