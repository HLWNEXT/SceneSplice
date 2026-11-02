"use client";

import { useState } from "react";
import { CLIMATE_CONDITIONS, type ClimateSelection } from "../../lib/climate";

type Props = {
  value: ClimateSelection;
  disabled?: boolean;
  onChange: (value: ClimateSelection) => void;
};

export function ClimateSelect({ value, disabled, onChange }: Props) {
  const isCustom = !!value && "custom" in value;
  const [customDraft, setCustomDraft] = useState(isCustom ? value.custom : "");

  return (
    <div className="grid gap-2">
      <div role="radiogroup" aria-label="Weather / climate condition" className="grid grid-cols-2 gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          disabled={disabled}
          onClick={() => onChange(null)}
          className={`rounded-none border px-3 py-2.5 text-left font-serif text-[13px] font-semibold transition-colors disabled:opacity-45 ${
            value === null ? "border-accent bg-accent text-on-accent" : "border-edge bg-field text-ink hover:bg-panel"
          }`}
        >
          None
        </button>
        {CLIMATE_CONDITIONS.map((c) => {
          const active = !!value && "id" in value && value.id === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange({ id: c.id })}
              className={`rounded-none border px-3 py-2.5 text-left font-serif text-[13px] font-semibold transition-colors disabled:opacity-45 ${
                active ? "border-accent bg-accent text-on-accent" : "border-edge bg-field text-ink hover:bg-panel"
              }`}
            >
              {c.label}
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
          Custom
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
          placeholder="e.g. thick wildfire smoke haze"
          aria-label="Custom weather/climate condition"
          className="rounded-none border border-edge bg-field px-3 py-2.5 font-serif text-sm text-ink outline-none focus:border-accent"
        />
      )}
    </div>
  );
}
