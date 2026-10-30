"use client";

import { ImageUp, X } from "lucide-react";
import { useRef, useState } from "react";

type Props = {
  file: File | null;
  previewUrl: string | null;
  disabled?: boolean;
  onFile: (file: File | null) => void;
};

export function ImageDropzone({ file, previewUrl, disabled, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Unsupported file. Provide a PNG, JPG or WebP render.");
      return;
    }
    setError(null);
    onFile(f);
  }

  if (file && previewUrl) {
    return (
      <div className="relative border border-line bg-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="As-built render" className="aspect-video w-full object-contain" />
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-dim">
          <span className="truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onFile(null)}
            className="flex items-center gap-1 uppercase hover:text-accent disabled:opacity-40"
          >
            <X size={14} /> Clear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files[0]); }}
        className={`flex aspect-video w-full flex-col items-center justify-center gap-3 border border-dashed text-sm uppercase tracking-widest transition-colors ${
          dragging ? "border-accent text-accent" : "border-line text-dim hover:border-white hover:text-white"
        }`}
      >
        <ImageUp size={28} strokeWidth={1.5} />
        <span>Drop as-built render</span>
        <span className="text-[10px] normal-case tracking-normal">or click to browse · PNG / JPG / WebP</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ""; }}
      />
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
