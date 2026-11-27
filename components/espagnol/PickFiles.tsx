"use client";

import { useRef } from "react";
import { formatSize } from "@/lib/files";

// Bouton « Joindre » + liste des fichiers choisis (avant envoi)
export function AttachButton({ onPick, label }: { onPick: (f: File[]) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          if (list.length) onPick(list);
          e.target.value = "";
        }}
      />
      <button type="button" className="attach-btn" onClick={() => ref.current?.click()} title="Joindre des fichiers" aria-label="Joindre des fichiers">
        📎{label ? ` ${label}` : ""}
      </button>
    </>
  );
}

export function PickedList({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  if (files.length === 0) return null;
  return (
    <ul className="attach picked">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`}>
          <span className="chip">
            <span>📎</span>
            <span className="text">{f.name}</span>
            <span className="muted small">{formatSize(f.size)}</span>
          </span>
          <button type="button" className="mini danger" onClick={() => onRemove(i)} aria-label={`Retirer ${f.name}`}>✕</button>
        </li>
      ))}
    </ul>
  );
}
