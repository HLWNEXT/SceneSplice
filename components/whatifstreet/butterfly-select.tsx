"use client";

import { useState } from "react";
import { BUTTERFLY_ACTIONS, type ButterflySelection } from "../../lib/butterfly";

type Props = {
  value: ButterflySelection | null;
  disabled?: boolean;
  onChange: (value: ButterflySelection | null) => void;
};

export function ButterflySelect({ value, disabled, onChange }: Props) {
  const isCustom = !!value && "custom" in value;
  const [customDraft, setCustomDraft] = useState(isCustom ? value.custom : "");

  return (
    <div className="grid gap-2">
      <div role="radiogroup" aria-label="Butterfly action" className="grid grid-cols-2 gap-2">
        {BUTTERFLY_ACTIONS.map((a) => {
          const active = !!value && "id" in value && value.id === a.id;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange({ id: a.id })}
              className={`rounded-none border px-3 py-2.5 text-left font-serif text-[13px] font-semibold transition-colors disabled:opacity-45 ${
                active ? "border-accent bg-accent text-on-accent" : "border-edge bg-field text-ink hover:bg-panel"
              }`}
            >
              {a.label}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={isCustom}
          disabled={disabled}
          onClick={() => onChange({ custom: customDraft })}
          className={`rounded-none border px-3 py-2.5 text-left font-serif text-[13px] font-semibold transition-colors disabled:opacity-45 ${
            isCustom ? "border-accent bg-accent text-on-accent" : "border-edge bg-field text-ink hover:bg-panel"
          }`}
        >
          Write your own
        </button>
      </div>
      {isCustom && (
        <input
          value={customDraft}
          disabled={disabled}
          onChange={(e) => {
            setCustomDraft(e.target.value);
            onChange({ custom: e.target.value });
          }}
          placeholder="e.g. fusion power became commercially viable"
          aria-label="Custom butterfly action"
          className="rounded-none border border-edge bg-field px-3 py-2.5 font-serif text-sm text-ink outline-none focus:border-accent"
        />
      )}
    </div>
  );
}
