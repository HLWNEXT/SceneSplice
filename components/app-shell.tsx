"use client";

import { Settings } from "lucide-react";
import { useState } from "react";
import { SettingsDialog } from "./settings-dialog";
import { Studio } from "./studio";
import { ScenarioApp } from "./scenario/scenario-app";

type Mode = "decay" | "whatifstreet";

export function AppShell() {
  const [mode, setMode] = useState<Mode>("decay");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped when settings are saved so the studios remount and re-check the (possibly new) ComfyUI server.
  const [serverEpoch, setServerEpoch] = useState(0);

  return (
    <>
      <header className="mx-auto w-[min(1120px,calc(100%-32px))] pt-10">
        <h1 className="text-[clamp(44px,8vw,96px)] font-bold uppercase leading-[0.92] tracking-[-0.04em] text-ink">
          Scene<span className="text-accent">Splice</span>
        </h1>
        <div className="my-5 h-[3px] w-24 rounded-full bg-accent" />
        <p className="max-w-[620px] text-sm leading-relaxed text-dim">
          Splice scenes through time: simulate how a space decays, or re-imagine a real street under a world-changing event.
        </p>
      </header>
      <nav className="mx-auto flex w-[min(1120px,calc(100%-32px))] items-center gap-2 pt-6" aria-label="Tools">
        {([
          ["decay", "Decay Studio"],
          ["whatifstreet", "WhatIfStreet"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`plaque-label rounded-full border-2 border-ink px-4 py-1.5 text-[11px] ${
              mode === id ? "bg-accent text-on-accent" : "chrome text-ink"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings — ComfyUI server and API keys"
          className="chrome ml-auto rounded-full border-2 border-ink p-2 text-ink"
        >
          <Settings size={15} />
        </button>
      </nav>
      <div key={serverEpoch} className="contents">
        {mode === "decay" ? <Studio /> : <ScenarioApp />}
      </div>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onSaved={() => setServerEpoch((n) => n + 1)} />}
    </>
  );
}
