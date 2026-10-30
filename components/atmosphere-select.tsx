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
            className={`rounded-lg border px-3 py-2.5 text-left text-[13px] font-semibold transition-colors disabled:opacity-45 ${
              active ? "border-accent bg-accent text-on-accent" : "border-[#595b64] bg-[#292a30] text-white hover:bg-[#33343b]"
            }`}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
