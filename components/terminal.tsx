"use client";

import { useEffect, useRef } from "react";

export type LogLine = { id: number; time: string; text: string };

export function Terminal({ lines, percent, busy }: { lines: LogLine[]; percent: number; busy: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines]);

  return (
    <div className="border border-line bg-black">
      <div className="h-1 w-full bg-line">
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="h-40 overflow-y-auto p-3 text-xs leading-relaxed" role="log" aria-live="polite">
        {lines.length === 0 && <span className="text-dim">&gt; awaiting input_</span>}
        {lines.map((l) => (
          <div key={l.id}>
            <span className="text-dim">{l.time}</span> <span className="text-accent">&gt;</span> {l.text}
          </div>
        ))}
        {busy && <span className="animate-pulse text-accent">█</span>}
        <div ref={endRef} />
      </div>
    </div>
  );
}
