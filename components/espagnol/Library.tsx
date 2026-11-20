"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ES_BUCKET, downloadFile, getEs, uploadToLibrary, type EsFile, type Folder } from "@/lib/espagnol";
import { KIND_ICON, formatDate, formatSize, kindOf } from "@/lib/files";
import EsPreview from "./EsPreview";

// Bibliothèque du prof : un vrai petit drive avec dossiers
export default function Library({ userId }: { userId: string }) {
  const es = getEs();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<EsFile[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<EsFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [f, fi] = await Promise.all([
      es.from("es_folders").select("id,parent_id,name").order("name"),
      es.from("es_files").select("*").order("created_at", { ascending: false }),
    ]);
    if (f.error) setError(f.error.message);
    else if (fi.error) setError(fi.error.message);
    else {
      setFolders((f.data ?? []) as Folder[]);
      setFiles((fi.data ?? []) as EsFile[]);
    }
    setLoading(false);
  }, [es]);

  useEffect(() => {
    load();
  }, [load]);

  const breadcrumb = useMemo(() => {
    const trail: Folder[] = [];
    let id = current;
    while (id) {
      const f = folders.find((x) => x.id === id);
      if (!f) break;
      trail.unshift(f);
      id = f.parent_id;
    }
    return trail;
  }, [folders, current]);

  const q = query.trim().toLowerCase();
  const subFolders = folders.filter((f) => f.parent_id === current && (!q || f.name.toLowerCase().includes(q)));
  const here = files.filter((f) => (q ? f.name.toLowerCase().includes(q) : f.folder_id === current));

  async function upload(list: FileList | File[]) {
    setError(null);
    const { errors } = await uploadToLibrary(Array.from(list), userId, current, setUploading);
    if (errors.length) setError(errors.join(" · "));
    if (inputRef.current) inputRef.current.value = "";
    await load();
  }

  async function newFolder() {
    const name = window.prompt("Nom du nouveau dossier :")?.trim();
    if (!name) return;
    const { error } = await es.from("es_folders").insert({ name, parent_id: current });
    if (error) setError(error.message);
    else await load();
  }

  async function removeFolder(f: Folder) {
    if (!window.confirm(`Supprimer le dossier « ${f.name} » ? (il doit être vide)`)) return;
    const { error } = await es.from("es_folders").delete().eq("id", f.id);
    if (error) setError("Ce dossier n'est pas vide : supprime ou déplace son contenu d'abord.");
    else await load();
  }

  async function removeFile(f: EsFile) {
    if (
      !window.confirm(
        `Supprimer « ${f.name} » ? Il disparaîtra aussi des publications où il est joint. Cette action est définitive.`
      )
    )
      return;
    setError(null);
    const { error: stErr } = await es.storage.from(ES_BUCKET).remove([f.path]);
    if (stErr) return setError(stErr.message);
    const { error: dbErr } = await es.from("es_files").delete().eq("id", f.id);
    if (dbErr) return setError(dbErr.message);
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
  }

  async function moveFile(f: EsFile) {
    const options = [{ id: null as string | null, label: "Racine" }].concat(
      folders.map((x) => ({ id: x.id, label: x.name }))
    );
    const list = options.map((o, i) => `${i}. ${o.label}`).join("\n");
    const answer = window.prompt(`Déplacer « ${f.name} » vers (numéro) :\n${list}`);
    if (answer === null) return;
    const target = options[Number(answer)];
    if (!target) return setError("Numéro de dossier invalide.");
    const { error } = await es.from("es_files").update({ folder_id: target.id }).eq("id", f.id);
    if (error) setError(error.message);
    else await load();
  }

  return (
    <section>
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
            <p>Glisse tes fichiers de cours ici</p>
            <button className="primary" onClick={() => inputRef.current?.click()}>
              Choisir des fichiers
            </button>
            <p className="muted small">50 Mo maximum par fichier · ils restent privés tant que tu ne les publies pas dans une classe</p>
          </>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="toolbar">
        <input type="search" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button onClick={newFolder}>+ Nouveau dossier</button>
      </div>

      <nav className="crumbs small">
        <button className="link" onClick={() => setCurrent(null)}>Bibliothèque</button>
        {breadcrumb.map((f) => (
          <span key={f.id}>
            {" / "}
            <button className="link" onClick={() => setCurrent(f.id)}>{f.name}</button>
          </span>
        ))}
      </nav>

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : subFolders.length === 0 && here.length === 0 ? (
        <p className="muted empty">{q ? "Aucun résultat." : "Ce dossier est vide."}</p>
      ) : (
        <ul className="list">
          {subFolders.map((f) => (
            <li key={f.id}>
              <button className="name" onClick={() => { setCurrent(f.id); setQuery(""); }}>
                <span className="icon">📁</span>
                <span className="text">{f.name}</span>
              </button>
              <span className="meta muted small">Dossier</span>
              <span className="actions">
                <button className="danger" onClick={() => removeFolder(f)}>Supprimer</button>
              </span>
            </li>
          ))}
          {here.map((f) => (
            <li key={f.id}>
              <button className="name" onClick={() => setPreview(f)} title="Ouvrir l'aperçu">
                <span className="icon">{KIND_ICON[kindOf(f)]}</span>
                <span className="text">{f.name}</span>
              </button>
              <span className="meta muted small">{formatSize(f.size)} · {formatDate(f.created_at)}</span>
              <span className="actions">
                <button onClick={() => setPreview(f)}>Aperçu</button>
                <button onClick={() => downloadFile(f).then((m) => m && setError(m))}>Télécharger</button>
                <button onClick={() => moveFile(f)}>Déplacer</button>
                <button className="danger" onClick={() => removeFile(f)}>Supprimer</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {preview && <EsPreview file={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
