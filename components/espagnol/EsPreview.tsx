"use client";

import { useEffect, useState } from "react";
import { ES_BUCKET, downloadFile, getEs } from "@/lib/espagnol";
import { kindOf } from "@/lib/files";

type Props = {
  file: { name: string; path: string; mime_type: string | null };
  onClose: () => void;
};

const MAX_TEXT_CHARS = 200_000;

export default function EsPreview({ file, onClose }: Props) {
  const kind = kindOf(file);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (kind === "other") return;
      const { data, error } = await getEs().storage.from(ES_BUCKET).createSignedUrl(file.path, 3600);
      if (cancelled) return;
      if (error || !data) {
        setError(error?.message ?? "Impossible de charger l'aperçu.");
        return;
      }
      setUrl(data.signedUrl);
      if (kind === "text") {
        try {
          const res = await fetch(data.signedUrl);
          const body = await res.text();
          if (!cancelled) {
            setText(body.length > MAX_TEXT_CHARS ? body.slice(0, MAX_TEXT_CHARS) + "\n\n… (aperçu tronqué)" : body);
          }
        } catch {
          if (!cancelled) setError("Impossible de lire ce fichier.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Aperçu de ${file.name}`}>
        <header>
          <strong title={file.name}>{file.name}</strong>
          <div className="actions">
            <button onClick={() => downloadFile(file)}>Télécharger</button>
            <button onClick={onClose} aria-label="Fermer">✕</button>
          </div>
        </header>
        <div className="body">
          {error && <p className="error">{error}</p>}
          {!error && kind === "other" && (
            <p className="muted">Aucun aperçu disponible pour ce type de fichier. Tu peux le télécharger.</p>
          )}
          {!error && kind !== "other" && !url && <p className="muted">Chargement…</p>}
          {url && kind === "image" && <img src={url} alt={file.name} />}
          {url && kind === "pdf" && <iframe src={url} title={file.name} />}
          {url && kind === "video" && <video src={url} controls />}
          {url && kind === "audio" && <audio src={url} controls />}
          {url && kind === "text" && (text === null ? <p className="muted">Chargement…</p> : <pre>{text}</pre>)}
        </div>
      </div>
    </div>
  );
}
