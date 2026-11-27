"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ES_BUCKET, downloadFile, getEs, uploadToLibrary, type ClassRow, type EsFile, type Folder } from "@/lib/espagnol";
import { KIND_ICON, formatDate, formatSize, kindOf } from "@/lib/files";
import { useDialog } from "../Dialogs";
import EsPreview from "./EsPreview";

// Bibliothèque du prof : un vrai petit drive avec dossiers
export default function Library({ userId }: { userId: string }) {
  const es = getEs();
  const dialog = useDialog();
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
  const [dragItem, setDragItem] = useState<{ type: "file" | "folder"; id: string } | null>(null);
  const [overTarget, setOverTarget] = useState<string | null>(null); // id de dossier, ou "root"
  const [moving, setMoving] = useState<{ type: "file" | "folder"; id: string; name: string } | null>(null);

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
    const name = await dialog.prompt({ title: "Nouveau dossier", message: "Nom du dossier", placeholder: "Ex. Séquence 1 — La famille", confirmLabel: "Créer" });
    if (!name) return;
    const { error } = await es.from("es_folders").insert({ name, parent_id: current });
    if (error) setError(error.message);
    else await load();
  }

  async function removeFolder(f: Folder) {
    if (!(await dialog.confirm({ title: "Supprimer le dossier ?", message: `« ${f.name} » sera supprimé. Il doit être vide.`, confirmLabel: "Supprimer" }))) return;
    const { error } = await es.from("es_folders").delete().eq("id", f.id);
    if (error) setError("Ce dossier n'est pas vide : supprime ou déplace son contenu d'abord.");
    else await load();
  }

  async function removeFile(f: EsFile) {
    if (!(await dialog.confirm({
      title: "Supprimer le fichier ?",
      message: `« ${f.name} »\nIl disparaîtra aussi des publications où il est joint. Cette action est définitive.`,
      confirmLabel: "Supprimer",
    }))) return;
    setError(null);
    const { error: stErr } = await es.storage.from(ES_BUCKET).remove([f.path]);
    if (stErr) return setError(stErr.message);
    const { error: dbErr } = await es.from("es_files").delete().eq("id", f.id);
    if (dbErr) return setError(dbErr.message);
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
  }

  // Un dossier ne peut pas être déplacé dans lui-même ni dans l'un de ses sous-dossiers
  function isInside(folderId: string | null, ancestorId: string): boolean {
    let id = folderId;
    while (id) {
      if (id === ancestorId) return true;
      id = folders.find((x) => x.id === id)?.parent_id ?? null;
    }
    return false;
  }

  async function moveItem(item: { type: "file" | "folder"; id: string }, target: string | null) {
    setError(null);
    if (item.type === "folder") {
      const f = folders.find((x) => x.id === item.id);
      if (!f || f.parent_id === target) return;
      if (isInside(target, item.id)) return setError("Impossible de déplacer un dossier dans lui-même.");
      const { error } = await es.from("es_folders").update({ parent_id: target }).eq("id", item.id);
      if (error) return setError(error.message);
    } else {
      const f = files.find((x) => x.id === item.id);
      if (!f || f.folder_id === target) return;
      const { error } = await es.from("es_files").update({ folder_id: target }).eq("id", item.id);
      if (error) return setError(error.message);
    }
    await load();
  }

  // Glisser-déposer : propriétés à poser sur un élément déplaçable / une cible
  const dragProps = (type: "file" | "folder", id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      setDragItem({ type, id });
    },
    onDragEnd: () => {
      setDragItem(null);
      setOverTarget(null);
    },
  });
  const dropProps = (target: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragItem) return;
      if (dragItem.type === "folder" && target && isInside(target, dragItem.id)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOverTarget(target ?? "root");
    },
    onDragLeave: () => setOverTarget((cur) => (cur === (target ?? "root") ? null : cur)),
    onDrop: (e: React.DragEvent) => {
      if (!dragItem) return;
      e.preventDefault();
      const item = dragItem;
      setDragItem(null);
      setOverTarget(null);
      void moveItem(item, target);
    },
  });
  const parentOfCurrent = folders.find((x) => x.id === current)?.parent_id ?? null;

  return (
    <section>
      <div
        className={`dropzone${dragging ? " active" : ""}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
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
        <button className={`link${overTarget === "root" ? " drop-over" : ""}`} onClick={() => setCurrent(null)} {...dropProps(null)}>Bibliothèque</button>
        {breadcrumb.map((f) => (
          <span key={f.id}>
            {" / "}
            <button className={`link${overTarget === f.id ? " drop-over" : ""}`} onClick={() => setCurrent(f.id)} {...dropProps(f.id)}>{f.name}</button>
          </span>
        ))}
      </nav>

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : subFolders.length === 0 && here.length === 0 ? (
        <p className="muted empty">{q ? "Aucun résultat." : "Ce dossier est vide."}</p>
      ) : (
        <ul className="list">
          {current && !q && (
            <li className={`up${overTarget === (parentOfCurrent ?? "root") ? " drop-over" : ""}`} {...dropProps(parentOfCurrent)}>
              <button className="name" onClick={() => setCurrent(parentOfCurrent)}>
                <span className="icon">↩</span>
                <span className="text">Dossier parent</span>
              </button>
              {dragItem && <span className="meta muted small">Déposer ici pour sortir du dossier</span>}
            </li>
          )}
          {subFolders.map((f) => (
            <li key={f.id} className={`${dragItem?.id === f.id ? "dragging" : ""}${overTarget === f.id ? " drop-over" : ""}`} {...dragProps("folder", f.id)} {...dropProps(f.id)}>
              <button className="name" onClick={() => { setCurrent(f.id); setQuery(""); }}>
                <span className="icon">📁</span>
                <span className="text">{f.name}</span>
              </button>
              <span className="meta muted small">Dossier</span>
              <span className="actions">
                <button onClick={() => setSharing({ title: `le dossier « ${f.name} »`, fileIds: filesInTree(f.id).map((x) => x.id) })} disabled={filesInTree(f.id).length === 0}>Partager</button>
                <button onClick={() => setMoving({ type: "folder", id: f.id, name: f.name })}>Déplacer</button>
                <button className="danger" onClick={() => removeFolder(f)}>Supprimer</button>
              </span>
            </li>
          ))}
          {here.map((f) => (
            <li key={f.id} className={dragItem?.id === f.id ? "dragging" : ""} {...dragProps("file", f.id)}>
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
                <button onClick={() => setMoving({ type: "file", id: f.id, name: f.name })}>Déplacer</button>
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

      {moving && (
        <MoveDialog
          name={moving.name}
          folders={folders}
          from={moving.type === "file" ? (files.find((x) => x.id === moving.id)?.folder_id ?? null) : (folders.find((x) => x.id === moving.id)?.parent_id ?? null)}
          blocked={(id) => moving.type === "folder" && isInside(id, moving.id)}
          onPick={(target) => {
            const m = moving;
            setMoving(null);
            void moveItem(m, target);
          }}
          onClose={() => setMoving(null)}
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
    <div className="dlg-back" onClick={onClose}>
      <div className="dlg" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Partager avec les élèves">
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
        <div className="dlg-actions">
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

// Choix du dossier de destination (alternative au glisser-déposer, utile sur mobile)
function MoveDialog({
  name,
  folders,
  from,
  blocked,
  onPick,
  onClose,
}: {
  name: string;
  folders: Folder[];
  from: string | null;
  blocked: (id: string) => boolean;
  onPick: (target: string | null) => void;
  onClose: () => void;
}) {
  const rows: { id: string | null; label: string; depth: number }[] = [{ id: null, label: "Bibliothèque (racine)", depth: 0 }];
  const walk = (parent: string | null, depth: number) => {
    for (const f of folders.filter((x) => x.parent_id === parent).sort((a, b) => a.name.localeCompare(b.name, "fr"))) {
      rows.push({ id: f.id, label: f.name, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 1);
  return (
    <div className="dlg-back" onClick={onClose}>
      <div className="dlg" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Déplacer">
        <h3>Déplacer « {name} »</h3>
        <p className="dlg-msg">Choisis le dossier de destination.</p>
        <ul className="move-list">
          {rows.map((r) => {
            const disabled = r.id === from || (r.id !== null && blocked(r.id));
            return (
              <li key={r.id ?? "root"}>
                <button disabled={disabled} style={{ paddingLeft: 12 + r.depth * 18 }} onClick={() => onPick(r.id)}>
                  <span>{r.id === null ? "🗂️" : "📁"}</span> {r.label}
                  {r.id === from && <span className="muted small"> · emplacement actuel</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="dlg-actions">
          <button type="button" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
