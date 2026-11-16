"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { BUCKET, getSupabase, type FileRow } from "@/lib/supabase";
import { KIND_ICON, formatDate, formatSize, kindOf, safeName } from "@/lib/files";
import Preview from "./Preview";

const MAX_SIZE = 50 * 1024 * 1024; // 50 Mo, aligné sur la limite du bucket

export default function Drive({ user }: { user: User }) {
  const supabase = getSupabase();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<FileRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("files").select("*").order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setFiles((data ?? []) as FileRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(list: FileList | File[]) {
    setError(null);
    for (const file of Array.from(list)) {
      if (file.size > MAX_SIZE) {
        setError(`${file.name} dépasse la limite de 50 Mo.`);
        continue;
      }
      setUploading(file.name);
      const path = `${user.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) {
        setError(`${file.name} : ${upErr.message}`);
        continue;
      }
      const { error: dbErr } = await supabase
        .from("files")
        .insert({ name: file.name, path, size: file.size, mime_type: file.type || null });
      if (dbErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        setError(`${file.name} : ${dbErr.message}`);
      }
    }
    setUploading(null);
    if (inputRef.current) inputRef.current.value = "";
    await load();
  }

  const download = useCallback(
    async (f: FileRow) => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 60, { download: f.name });
      if (error || !data) {
        setError(error?.message ?? "Téléchargement impossible.");
        return;
      }
      window.location.href = data.signedUrl;
    },
    [supabase]
  );

  async function remove(f: FileRow) {
    if (!window.confirm(`Supprimer « ${f.name} » ? Cette action est définitive.`)) return;
    setError(null);
    const { error: stErr } = await supabase.storage.from(BUCKET).remove([f.path]);
    if (stErr) return setError(stErr.message);
    const { error: dbErr } = await supabase.from("files").delete().eq("id", f.id);
    if (dbErr) return setError(dbErr.message);
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files;
  }, [files, query]);

  const total = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  return (
    <main className="drive">
      <header className="topbar">
        <h1>Drive</h1>
        <div className="who">
          <span className="muted">{user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>Déconnexion</button>
        </div>
      </header>

      <div
        className={`dropzone${dragging ? " active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
      >
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
        {uploading ? (
          <p>Envoi de « {uploading} »…</p>
        ) : (
          <>
            <p>Glisse tes fichiers ici</p>
            <button className="primary" onClick={() => inputRef.current?.click()}>
              Choisir des fichiers
            </button>
            <p className="muted small">50 Mo maximum par fichier</p>
          </>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="toolbar">
        <input
          type="search"
          placeholder="Rechercher un fichier…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted small">
          {files.length} fichier{files.length > 1 ? "s" : ""} · {formatSize(total)}
        </span>
      </div>

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="muted empty">{files.length === 0 ? "Aucun fichier pour l'instant." : "Aucun résultat."}</p>
      ) : (
        <ul className="list">
          {visible.map((f) => (
            <li key={f.id}>
              <button className="name" onClick={() => setPreview(f)} title="Ouvrir l'aperçu">
                <span className="icon">{KIND_ICON[kindOf(f)]}</span>
                <span className="text">{f.name}</span>
              </button>
              <span className="meta muted small">
                {formatSize(f.size)} · {formatDate(f.created_at)}
              </span>
              <span className="actions">
                <button onClick={() => setPreview(f)}>Aperçu</button>
                <button onClick={() => download(f)}>Télécharger</button>
                <button className="danger" onClick={() => remove(f)}>
                  Supprimer
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {preview && <Preview file={preview} onClose={() => setPreview(null)} onDownload={download} />}
    </main>
  );
}
