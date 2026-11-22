"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ES_BUCKET,
  KIND_LABEL,
  POST_SELECT,
  postSortKey,
  sessionLabel,
  MAX_SIZE,
  formatDateTime,
  getEs,
  postFiles,
  type ClassRow,
  type Post,
  type Submission,
} from "@/lib/espagnol";
import { safeName } from "@/lib/files";
import NotebookMark from "../NotebookMark";
import Attachments from "./Attachments";
import StudentHome, { type StudentTab } from "./StudentHome";
import { StudentMessages } from "./StudentMessages";
import Timetable from "./Timetable";

const NAV: { id: StudentTab; label: string; title: string }[] = [
  { id: "work", label: "Cahier de textes", title: "Cahier de textes" },
  { id: "timetable", label: "Emploi du temps", title: "Emploi du temps" },
  { id: "messages", label: "Communication", title: "Informations et messagerie" },
];

export default function Student({ userId, name, onSignOut }: { userId: string; name: string; onSignOut: () => void }) {
  const es = getEs();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<StudentTab>("home");

  const load = useCallback(async () => {
    const { data, error } = await es.from("es_classes").select("id,name,code,created_at").order("created_at");
    if (error) setError(error.message);
    else {
      const list = (data ?? []) as ClassRow[];
      setClasses(list);
      setSelected((cur) => (cur && list.some((x) => x.id === cur) ? cur : list[0]?.id ?? null));
    }
    setLoading(false);
  }, [es]);

  useEffect(() => {
    load();
  }, [load]);

  // Mémorise que l'élève a tapé son code (pastille verte côté professeur)
  useEffect(() => {
    es.from("es_profiles").update({ last_login_at: new Date().toISOString() }).eq("id", userId).then(() => undefined);
  }, [es, userId]);

  const title = tab === "home" ? "Page d'accueil" : (NAV.find((n) => n.id === tab)?.title ?? "");
  const dateLabel = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="pn student-pn">
      <header className="pn-header">
        <div className="pn-logo"><NotebookMark size={34} /></div>
        <div className="pn-center">
          <div className="pn-school">COURS D&apos;ESPAGNOL</div>
          <div className="pn-who">
            Espace Élèves - {name.toUpperCase()}
            <button className="pn-power" onClick={onSignOut} title="Déconnexion" aria-label="Déconnexion">⏻</button>
          </div>
        </div>
        <div className="pn-brandmark"><strong>Le Carnet</strong></div>
      </header>
      <nav className="pn-tabs" aria-label="Menu élève">
        <button className={`home${tab === "home" ? " on" : ""}`} onClick={() => setTab("home")} aria-label="Accueil" title="Accueil">🏠</button>
        {NAV.map((n) => (
          <button key={n.id} className={tab === n.id ? "on" : ""} onClick={() => setTab(n.id)}>{n.label}</button>
        ))}
        <span className="grow" />
        <span className="pn-date">{dateLabel}</span>
      </nav>
      <main className="pn-page">
        <h1 className="pn-title">{title}</h1>
        {error && <p className="error">{error}</p>}
        {loading ? (
          <p className="muted">Chargement…</p>
        ) : (
          <>
            {(tab === "work" || tab === "messages") && classes.length > 1 && (
              <div className="class-picker">
                {classes.map((c) => (
                  <button key={c.id} className={c.id === selected ? "on" : ""} onClick={() => setSelected(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {tab === "home" ? (
              <StudentHome userId={userId} classes={classes} onGo={setTab} />
            ) : tab === "timetable" ? (
              <Timetable readOnly classes={classes} />
            ) : tab === "messages" ? (
              selected ? <StudentMessages key={selected} userId={userId} classId={selected} /> : <p className="muted empty">Tu n&apos;as pas encore de classe.</p>
            ) : selected ? (
              <Feed key={selected} userId={userId} classId={selected} />
            ) : (
              <p className="muted empty">Tu n&apos;as pas encore de classe. Demande à ton professeur.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Feed({ userId, classId }: { userId: string; classId: string }) {
  const es = getEs();
  const [posts, setPosts] = useState<Post[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = await es
      .from("es_posts")
      .select(POST_SELECT)
      .eq("class_id", classId);
    if (p.error) {
      setError(p.error.message);
      setLoading(false);
      return;
    }
    const list = ((p.data ?? []) as unknown as Post[]).sort((a, b) => postSortKey(b).localeCompare(postSortKey(a)));
    setPosts(list);
    const ids = list.filter((x) => x.kind === "assignment").map((x) => x.id);
    if (ids.length) {
      const s = await es.from("es_submissions").select("*, es_submission_files(*)").in("post_id", ids);
      if (s.error) setError(s.error.message);
      else setSubs((s.data ?? []) as Submission[]);
    } else setSubs([]);
    const todoIds = list.filter((x) => x.kind === "todo").map((x) => x.id);
    if (todoIds.length) {
      const d = await es.from("es_post_done").select("post_id").in("post_id", todoIds);
      if (d.error) setError(d.error.message);
      else setDone(new Set((d.data ?? []).map((x: { post_id: string }) => x.post_id)));
    } else setDone(new Set());
    setLoading(false);
  }, [es, classId]);

  async function toggleDone(postId: string) {
    const isDone = done.has(postId);
    // mise à jour immédiate, annulée en cas d'erreur
    setDone((prev) => {
      const next = new Set(prev);
      if (isDone) next.delete(postId);
      else next.add(postId);
      return next;
    });
    const { error } = isDone
      ? await es.from("es_post_done").delete().eq("post_id", postId).eq("student_id", userId)
      : await es.from("es_post_done").insert({ post_id: postId });
    if (error) {
      setError(error.message);
      load();
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="muted">Chargement…</p>;
  if (error) return <p className="error">{error}</p>;
  if (posts.length === 0) return <p className="muted empty">Ton professeur n&apos;a encore rien publié.</p>;

  return (
    <div className="posts">
      {posts.map((p) => (
        <StudentPost
          key={p.id}
          post={p}
          userId={userId}
          sub={subs.find((s) => s.post_id === p.id) ?? null}
          done={done.has(p.id)}
          onToggleDone={() => toggleDone(p.id)}
          onChanged={load}
        />
      ))}
    </div>
  );
}

function StudentPost({
  post,
  userId,
  sub,
  done,
  onToggleDone,
  onChanged,
}: {
  post: Post;
  userId: string;
  sub: Submission | null;
  done: boolean;
  onToggleDone: () => void;
  onChanged: () => void;
}) {
  const files = postFiles(post);
  const overdue = post.due_at !== null && new Date(post.due_at) < new Date();
  const status = sub ? (sub.grade ? "Noté" : "Rendu") : overdue ? "En retard" : "À rendre";

  return (
    <article className={`card post kind-${post.kind}`}>
      <header>
        <span className={`badge ${post.kind}`}>{KIND_LABEL[post.kind]}</span>
        {post.kind === "assignment" && (
          <span className={`badge status ${sub ? "done" : overdue ? "late" : "todo"}`}>{status}</span>
        )}
        {post.kind === "todo" && (
          <span className={`badge status ${done ? "done" : "todo"}`}>{done ? "Fait ✓" : "À faire"}</span>
        )}
        <span className="muted small date">{post.given ? `Cours du ${sessionLabel(post.given)}` : formatDateTime(post.created_at)}</span>
      </header>
      <h3>{post.title}</h3>
      {(post.due || post.due_at) && (
        <p className="due small">
          📅 {post.kind === "todo" ? "À faire pour" : "À rendre pour"}{" "}
          {post.due ? `le cours du ${sessionLabel(post.due)}` : `le ${formatDateTime(post.due_at!)}`}
        </p>
      )}
      {post.body && <p className="body">{post.body}</p>}
      <Attachments files={files} />
      {post.kind === "todo" && (
        <label className="check done-check">
          <input type="checkbox" checked={done} onChange={onToggleDone} />
          J&apos;ai fini ce travail
        </label>
      )}
      {post.kind === "assignment" && <SubmitBox post={post} userId={userId} sub={sub} onChanged={onChanged} />}
    </article>
  );
}

function SubmitBox({
  post,
  userId,
  sub,
  onChanged,
}: {
  post: Post;
  userId: string;
  sub: Submission | null;
  onChanged: () => void;
}) {
  const es = getEs();
  const [editing, setEditing] = useState(sub === null);
  const [body, setBody] = useState(sub?.body ?? "");
  const [picked, setPicked] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const tooBig = picked.find((f) => f.size > MAX_SIZE);
    if (tooBig) return setError(`${tooBig.name} dépasse la limite de 50 Mo.`);
    if (!body.trim() && picked.length === 0 && !(sub && sub.es_submission_files.length)) {
      return setError("Ajoute un texte ou un fichier avant d'envoyer.");
    }
    setBusy(true);

    let subId = sub?.id ?? null;
    if (subId) {
      const { error } = await es
        .from("es_submissions")
        .update({ body: body.trim(), submitted_at: new Date().toISOString() })
        .eq("id", subId);
      if (error) {
        setBusy(false);
        return setError(error.message);
      }
    } else {
      const { data, error } = await es
        .from("es_submissions")
        .insert({ post_id: post.id, body: body.trim() })
        .select("id")
        .single();
      if (error || !data) {
        setBusy(false);
        return setError(error?.message ?? "Envoi impossible.");
      }
      subId = data.id as string;
    }

    const errors: string[] = [];
    for (const file of picked) {
      const path = `sub/${userId}/${post.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const up = await es.storage
        .from(ES_BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (up.error) {
        errors.push(`${file.name} : ${up.error.message}`);
        continue;
      }
      const ins = await es.from("es_submission_files").insert({
        submission_id: subId,
        name: file.name,
        path,
        size: file.size,
        mime_type: file.type || null,
      });
      if (ins.error) {
        await es.storage.from(ES_BUCKET).remove([path]);
        errors.push(`${file.name} : ${ins.error.message}`);
      }
    }

    setBusy(false);
    if (errors.length) setError(errors.join(" · "));
    setPicked([]);
    if (inputRef.current) inputRef.current.value = "";
    setEditing(false);
    onChanged();
  }

  async function removeFile(f: { id: string; path: string }) {
    await es.storage.from(ES_BUCKET).remove([f.path]);
    const { error } = await es.from("es_submission_files").delete().eq("id", f.id);
    if (error) setError(error.message);
    else onChanged();
  }

  async function withdraw() {
    if (!sub || !window.confirm("Annuler ton rendu ? Ton texte et tes fichiers seront supprimés.")) return;
    const paths = sub.es_submission_files.map((f) => f.path);
    if (paths.length) await es.storage.from(ES_BUCKET).remove(paths);
    const { error } = await es.from("es_submissions").delete().eq("id", sub.id);
    if (error) setError(error.message);
    else {
      setBody("");
      setEditing(true);
      onChanged();
    }
  }

  return (
    <div className="submit-box">
      {sub && (
        <div className="mine">
          <p className="small">
            <strong>Ton rendu</strong> <span className="muted">· envoyé le {formatDateTime(sub.submitted_at)}</span>
          </p>
          {sub.body && <p className="body">{sub.body}</p>}
          <Attachments files={sub.es_submission_files} onRemove={editing ? removeFile : undefined} />
          {(sub.grade || sub.feedback) && (
            <div className="grade">
              {sub.grade && <p><strong>Note : {sub.grade}</strong></p>}
              {sub.feedback && <p>💬 {sub.feedback}</p>}
            </div>
          )}
        </div>
      )}

      {editing ? (
        <form onSubmit={send}>
          <label>
            {sub ? "Modifier ton texte" : "Ta réponse (facultatif si tu joins un fichier)"}
            <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <div className="attach-bar">
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => setPicked((prev) => prev.concat(Array.from(e.target.files ?? [])))}
            />
            <button type="button" onClick={() => inputRef.current?.click()}>⬆ Ajouter des fichiers</button>
            {picked.map((f, i) => (
              <span key={i} className="chip">
                <span className="text">{f.name}</span>
                <button
                  type="button"
                  className="mini danger"
                  aria-label={`Retirer ${f.name}`}
                  onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
          <div className="post-actions">
            <button className="primary" disabled={busy}>{busy ? "Envoi…" : sub ? "Mettre à jour mon rendu" : "Rendre le devoir"}</button>
            {sub && <button type="button" onClick={() => setEditing(false)}>Annuler</button>}
          </div>
        </form>
      ) : (
        <div className="post-actions">
          <button onClick={() => setEditing(true)}>Modifier mon rendu</button>
          <button className="danger" onClick={withdraw}>Retirer mon rendu</button>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
}
