"use client";

import { ATMOSPHERES } from "../lib/atmosphere";

type Props = {
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
};

export function AtmosphereSelect({ value, disabled, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Atmospheric conditions" className="grid grid-cols-2 gap-px bg-line">
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
            className={`px-3 py-3 text-left text-xs uppercase tracking-wider transition-colors disabled:opacity-50 ${
              active ? "bg-accent text-black" : "bg-panel text-dim hover:text-white"
            }`}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
