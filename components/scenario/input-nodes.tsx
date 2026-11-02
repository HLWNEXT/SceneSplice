"use client";

import { Check, CloudSun, Hourglass, MapPin, Sparkles, type LucideIcon } from "lucide-react";
import { INPUT_KINDS, INPUT_LABELS, type InputKind } from "../../lib/scenario";

const ICONS: Record<InputKind, LucideIcon> = {
  location: MapPin,
  time: Hourglass,
  butterfly: Sparkles,
  environment: CloudSun,
};

const PROMPTS: Record<InputKind, string> = {
  location: "Pick a street",
  time: "Pick a moment",
  butterfly: "Pick an event",
  environment: "Pick the weather",
};

type Props = {
  /** What the user chose for each input, or null while it is still empty. */
  summaries: Record<InputKind, string | null>;
  selected: InputKind | null;
  onSelect: (kind: InputKind) => void;
  /** Once a story exists the nodes shrink into a rail at the left edge of the canvas. */
  docked: boolean;
};

export function InputNodes({ summaries, selected, onSelect, docked }: Props) {
  return (
    <div
      className={`pointer-events-none absolute z-20 flex ${
        docked ? "inset-y-3 left-3 w-[148px] flex-col justify-center gap-2" : "inset-0 flex-wrap items-center justify-center gap-4 p-4"
      }`}
    >
      {INPUT_KINDS.map((kind) => {
        const Icon = ICONS[kind];
        const value = summaries[kind];
        const sel = selected === kind;
        return (
          <button
            key={kind}
            type="button"
            data-ui
            aria-pressed={sel}
            onClick={() => onSelect(kind)}
            className={`pointer-events-auto relative flex flex-col border bg-stage text-left shadow-[0_6px_18px_rgba(0,0,0,0.45)] transition-colors hover:border-stage-oxide ${
              docked ? "gap-0.5 px-2.5 py-2" : "h-[148px] w-[190px] gap-2 p-3.5"
            } ${sel ? "border-stage-oxide ring-1 ring-stage-oxide" : "border-stage-line"}`}
          >
            <span className="flex items-center gap-2 text-stage-oxide">
              <Icon size={docked ? 13 : 18} />
              <span className="plaque-label text-[10px]">{INPUT_LABELS[kind]}</span>
            </span>
            <span className={`font-serif leading-snug ${value ? "text-void" : "italic text-stage-dim"} ${docked ? "line-clamp-2 text-[11px]" : "line-clamp-4 text-sm"}`}>
              {value ?? PROMPTS[kind]}
            </span>
            {value && (
              <Check size={docked ? 11 : 14} className="absolute right-2 top-2 text-sage" aria-label="Set" />
            )}
          </button>
        );
      })}
    </div>
  );
}
