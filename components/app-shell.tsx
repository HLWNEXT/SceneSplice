"use client";

import { useState } from "react";
import { Studio } from "./studio";
import { StorylineCanvas } from "./storyline/storyline-canvas";
import { WhatIfStreetStudio } from "./whatifstreet/studio";

type Mode = "decay" | "whatifstreet" | "storyline";

export function AppShell() {
  const [mode, setMode] = useState<Mode>("decay");

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
      </nav>
      {mode === "decay" ? <Studio /> : mode === "whatifstreet" ? <WhatIfStreetStudio /> : <StorylineCanvas />}
    </>
  );
}
