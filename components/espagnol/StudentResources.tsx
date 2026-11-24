"use client";

import { useEffect, useState } from "react";
import { downloadFile, getEs, type ClassRow, type EsFile } from "@/lib/espagnol";
import { KIND_ICON, formatDate, formatSize, kindOf } from "@/lib/files";
import EsPreview from "./EsPreview";

type Row = { class_id: string; created_at: string; es_files: EsFile | null };

// Ressources partagées par le professeur avec la classe
export default function StudentResources({ classes }: { classes: ClassRow[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<EsFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEs()
      .from("es_file_shares")
      .select("class_id,created_at,es_files(*)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows(((data ?? []) as unknown as Row[]).filter((r) => r.es_files));
        setLoading(false);
      });
  }, []);

  const q = query.trim().toLowerCase();
  const list = rows.filter((r) => !q || r.es_files!.name.toLowerCase().includes(q));
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "";

  return (
    <section>
      {error && <p className="error">{error}</p>}
      <div className="toolbar">
        <input type="search" placeholder="Rechercher une ressource…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {loading ? (
        <p className="muted">Chargement…</p>
      ) : list.length === 0 ? (
        <p className="muted empty">{q ? "Aucun résultat." : "Ton professeur n'a pas encore partagé de ressource."}</p>
      ) : (
        <ul className="list">
          {list.map((r) => {
            const f = r.es_files!;
            return (
              <li key={`${r.class_id}-${f.id}`}>
                <button className="name" onClick={() => setPreview(f)} title="Ouvrir l'aperçu">
                  <span className="icon">{KIND_ICON[kindOf(f)]}</span>
                  <span className="text">{f.name}</span>
                  {classes.length > 1 && <span className="badge">{className(r.class_id)}</span>}
                </button>
                <span className="meta muted small">{formatSize(f.size)} · partagé le {formatDate(r.created_at)}</span>
                <span className="actions">
                  <button onClick={() => setPreview(f)}>Ouvrir</button>
                  <button onClick={() => downloadFile(f).then((m) => m && setError(m))}>Télécharger</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {preview && <EsPreview file={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
