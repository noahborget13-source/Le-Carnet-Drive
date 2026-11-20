"use client";

import { useEffect, useState } from "react";
import { getEs, type EsFile } from "@/lib/espagnol";
import { KIND_ICON, formatSize, kindOf } from "@/lib/files";

// Fenêtre pour choisir des fichiers de la bibliothèque à joindre à une publication
export default function FilePicker({
  selected,
  onConfirm,
  onClose,
}: {
  selected: EsFile[];
  onConfirm: (files: EsFile[]) => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<EsFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Map<string, EsFile>>(new Map(selected.map((f): [string, EsFile] => [f.id, f])));

  useEffect(() => {
    getEs()
      .from("es_files")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setFiles((data ?? []) as EsFile[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(f: EsFile) {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(f.id)) next.delete(f.id);
      else next.set(f.id, f);
      return next;
    });
  }

  const q = query.trim().toLowerCase();
  const visible = q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choisir des fichiers">
        <header>
          <strong>Joindre des fichiers de la bibliothèque</strong>
          <button onClick={onClose} aria-label="Fermer">✕</button>
        </header>
        <div className="picker-body">
          <input type="search" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {error && <p className="error">{error}</p>}
          {loading ? (
            <p className="muted">Chargement…</p>
          ) : visible.length === 0 ? (
            <p className="muted empty">Aucun fichier. Ajoute-en dans l&apos;onglet « Bibliothèque ».</p>
          ) : (
            <ul className="pick-list">
              {visible.map((f) => (
                <li key={f.id}>
                  <label>
                    <input type="checkbox" checked={picked.has(f.id)} onChange={() => toggle(f)} />
                    <span className="icon">{KIND_ICON[kindOf(f)]}</span>
                    <span className="text">{f.name}</span>
                    <span className="muted small">{formatSize(f.size)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer>
          <span className="muted small">{picked.size} sélectionné{picked.size > 1 ? "s" : ""}</span>
          <button className="primary" onClick={() => onConfirm(Array.from(picked.values()))}>Valider</button>
        </footer>
      </div>
    </div>
  );
}
