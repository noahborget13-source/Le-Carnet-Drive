"use client";

import { useState } from "react";
import { downloadFile } from "@/lib/espagnol";
import { KIND_ICON, formatSize, kindOf } from "@/lib/files";
import EsPreview from "./EsPreview";

type F = { id: string; name: string; path: string; size: number; mime_type: string | null };

export default function Attachments({
  files,
  onRemove,
}: {
  files: F[];
  onRemove?: (f: F) => void;
}) {
  const [preview, setPreview] = useState<F | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (files.length === 0) return null;
  return (
    <>
      <ul className="attach">
        {files.map((f) => (
          <li key={f.id}>
            <button className="chip" onClick={() => setPreview(f)} title="Ouvrir l'aperçu">
              <span>{KIND_ICON[kindOf(f)]}</span>
              <span className="text">{f.name}</span>
              <span className="muted small">{formatSize(f.size)}</span>
            </button>
            <button className="mini" onClick={() => downloadFile(f).then((m) => setError(m))} aria-label={`Télécharger ${f.name}`}>
              ⬇
            </button>
            {onRemove && (
              <button className="mini danger" onClick={() => onRemove(f)} aria-label={`Retirer ${f.name}`}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
      {preview && <EsPreview file={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
