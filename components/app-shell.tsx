"use client";

import { Settings } from "lucide-react";
import { useState } from "react";
import { SettingsDialog } from "./settings-dialog";
import { Studio } from "./studio";
import { StorylineCanvas } from "./storyline/storyline-canvas";
import { WhatIfStreetStudio } from "./whatifstreet/studio";

type Mode = "decay" | "whatifstreet" | "storyline";

export function AppShell() {
  const [mode, setMode] = useState<Mode>("decay");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped when settings are saved so the studios remount and re-check the (possibly new) ComfyUI server.
  const [serverEpoch, setServerEpoch] = useState(0);

  return (
    <>
      <nav className="mx-auto flex w-[min(1120px,calc(100%-32px))] gap-2 pt-6" aria-label="App mode">
        {([
          ["decay", "Decay Studio"],
          ["whatifstreet", "WhatIfStreet"],
          ["storyline", "Storyline"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`plaque-label rounded-none border px-3.5 py-2 text-xs ${
              mode === id ? "border-accent bg-accent text-on-accent" : "border-edge bg-field text-ink hover:bg-panel"
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
          className="ml-auto rounded-none border border-edge bg-field px-3 py-2 text-ink hover:bg-panel"
        >
          <Settings size={16} />
        </button>
      </nav>
      <div key={serverEpoch} className="contents">
        {mode === "decay" ? <Studio /> : mode === "whatifstreet" ? <WhatIfStreetStudio /> : <StorylineCanvas />}
      </div>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onSaved={() => setServerEpoch((n) => n + 1)} />}
    </>
  );
}
