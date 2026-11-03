"use client";

import { ATMOSPHERES } from "../lib/atmosphere";

type Props = {
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
};

export function AtmosphereSelect({ value, disabled, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Atmospheric conditions" className="grid grid-cols-2 gap-2">
      {ATMOSPHERES.map((a) => {
        const active = a.id === value;
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(a.id)}
            className={`rounded-none border px-3 py-2.5 text-left font-serif text-[13px] font-semibold transition-colors disabled:opacity-45 ${
              active ? "border-accent bg-accent text-on-accent" : "border-edge bg-field text-ink hover:bg-panel"
            }`}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
