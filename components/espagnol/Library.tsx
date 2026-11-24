"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ES_BUCKET, downloadFile, getEs, uploadToLibrary, type ClassRow, type EsFile, type Folder } from "@/lib/espagnol";
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
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [shares, setShares] = useState<Map<string, Set<string>>>(new Map());
  const [sharing, setSharing] = useState<{ title: string; fileIds: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [f, fi, c, sh] = await Promise.all([
      es.from("es_folders").select("id,parent_id,name").order("name"),
      es.from("es_files").select("*").order("created_at", { ascending: false }),
      es.from("es_classes").select("id,name,code,created_at").order("created_at"),
      es.from("es_file_shares").select("file_id,class_id"),
    ]);
    const err = f.error ?? fi.error ?? c.error ?? sh.error;
    if (err) setError(err.message);
    else {
      setFolders((f.data ?? []) as Folder[]);
      setFiles((fi.data ?? []) as EsFile[]);
      setClasses((c.data ?? []) as ClassRow[]);
      const m = new Map<string, Set<string>>();
      for (const x of (sh.data ?? []) as { file_id: string; class_id: string }[]) {
        m.set(x.file_id, (m.get(x.file_id) ?? new Set<string>()).add(x.class_id));
      }
      setShares(m);
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

  // Tous les fichiers d'un dossier, sous-dossiers compris
  function filesInTree(folderId: string): EsFile[] {
    const ids = new Set<string>([folderId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) {
        if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
          ids.add(f.id);
          grew = true;
        }
      }
    }
    return files.filter((x) => x.folder_id && ids.has(x.folder_id));
  }

  async function saveShares(fileIds: string[], selected: Set<string>) {
    setError(null);
    for (const cid of classes.map((c) => c.id)) {
      if (selected.has(cid)) continue;
      const { error } = await es.from("es_file_shares").delete().eq("class_id", cid).in("file_id", fileIds);
      if (error) return setError(error.message);
    }
    const rows = fileIds.flatMap((fid) => Array.from(selected).map((cid) => ({ file_id: fid, class_id: cid })));
    if (rows.length) {
      const { error } = await es.from("es_file_shares").upsert(rows, { onConflict: "file_id,class_id", ignoreDuplicates: true });
      if (error) return setError(error.message);
    }
    setSharing(null);
    await load();
  }

  const sharedLabel = (fileId: string) => {
    const set = shares.get(fileId);
    if (!set || set.size === 0) return null;
    return classes.filter((c) => set.has(c.id)).map((c) => c.name).join(", ");
  };

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
            <p className="muted small">50 Mo maximum par fichier · ils restent privés tant que tu ne les partages pas avec une classe</p>
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
                <button onClick={() => setSharing({ title: `le dossier « ${f.name} »`, fileIds: filesInTree(f.id).map((x) => x.id) })} disabled={filesInTree(f.id).length === 0}>Partager</button>
                <button className="danger" onClick={() => removeFolder(f)}>Supprimer</button>
              </span>
            </li>
          ))}
          {here.map((f) => (
            <li key={f.id}>
              <button className="name" onClick={() => setPreview(f)} title="Ouvrir l'aperçu">
                <span className="icon">{KIND_ICON[kindOf(f)]}</span>
                <span className="text">{f.name}</span>
                {sharedLabel(f.id) && <span className="badge shared" title={`Partagé avec : ${sharedLabel(f.id)}`}>👥 Partagé</span>}
              </button>
              <span className="meta muted small">{formatSize(f.size)} · {formatDate(f.created_at)}</span>
              <span className="actions">
                <button onClick={() => setPreview(f)}>Aperçu</button>
                <button onClick={() => downloadFile(f).then((m) => m && setError(m))}>Télécharger</button>
                <button onClick={() => setSharing({ title: `« ${f.name} »`, fileIds: [f.id] })}>Partager</button>
                <button onClick={() => moveFile(f)}>Déplacer</button>
                <button className="danger" onClick={() => removeFile(f)}>Supprimer</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {sharing && (
        <ShareDialog
          title={sharing.title}
          classes={classes}
          fileIds={sharing.fileIds}
          shares={shares}
          onSave={(sel) => saveShares(sharing.fileIds, sel)}
          onClose={() => setSharing(null)}
        />
      )}

      {preview && <EsPreview file={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}

// Choix des classes qui voient le fichier (ou tous les fichiers du dossier)
function ShareDialog({
  title,
  classes,
  fileIds,
  shares,
  onSave,
  onClose,
}: {
  title: string;
  classes: ClassRow[];
  fileIds: string[];
  shares: Map<string, Set<string>>;
  onSave: (selected: Set<string>) => void;
  onClose: () => void;
}) {
  // une classe est cochée au départ si elle voit déjà tous les fichiers concernés
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(classes.filter((c) => fileIds.length > 0 && fileIds.every((id) => shares.get(id)?.has(c.id))).map((c) => c.id))
  );
  const [busy, setBusy] = useState(false);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Partager avec les élèves">
        <h3>Partager {title} avec les élèves</h3>
        {fileIds.length > 1 && <p className="muted small">{fileIds.length} fichiers concernés.</p>}
        {classes.length === 0 ? (
          <p className="muted small">Crée d&apos;abord une classe (Cahier de textes → Classes et élèves).</p>
        ) : (
          classes.map((c) => (
            <label key={c.id} className="check">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={(e) =>
                  setSelected((cur) => {
                    const next = new Set(cur);
                    if (e.target.checked) next.add(c.id);
                    else next.delete(c.id);
                    return next;
                  })
                }
              />
              {c.name}
            </label>
          ))
        )}
        <p className="muted small">Les classes cochées retrouvent le fichier dans leur onglet « Ressources ». Décocher une classe le retire pour elle.</p>
        <div className="row end">
          <button type="button" onClick={onClose}>Annuler</button>
          <button
            className="primary"
            disabled={busy || classes.length === 0}
            onClick={() => {
              setBusy(true);
              onSave(selected);
            }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
