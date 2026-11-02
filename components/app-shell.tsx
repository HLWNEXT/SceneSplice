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
      <nav className="mx-auto flex w-[min(1120px,calc(100%-32px))] items-center gap-2 pt-6" aria-label="App mode">
        <span aria-hidden className="mr-2 size-5 rounded-full border-2 border-ink bg-accent shadow-[inset_0_0_0_3px_var(--color-field)]" />
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
