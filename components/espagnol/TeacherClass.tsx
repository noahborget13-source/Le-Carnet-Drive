"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  KIND_LABEL,
  formatDateTime,
  getEs,
  localToIso,
  postFiles,
  uploadToLibrary,
  type ClassRow,
  type EsFile,
  type PostKind,
  type Post,
  type Profile,
  type Submission,
} from "@/lib/espagnol";
import Attachments from "./Attachments";
import FilePicker from "./FilePicker";

type Props = {
  userId: string;
  cls: ClassRow;
  profiles: Map<string, Profile>;
  onDeleted: () => void;
};

export default function TeacherClass({ userId, cls, profiles, onDeleted }: Props) {
  const es = getEs();
  const [posts, setPosts] = useState<Post[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"posts" | "students">("posts");

  const load = useCallback(async () => {
    const [p, m] = await Promise.all([
      es
        .from("es_posts")
        .select("*, es_post_files(es_files(*))")
        .eq("class_id", cls.id)
        .order("created_at", { ascending: false }),
      es.from("es_members").select("student_id").eq("class_id", cls.id),
    ]);
    if (p.error) setError(p.error.message);
    else if (m.error) setError(m.error.message);
    else {
      const list = (p.data ?? []) as Post[];
      setPosts(list);
      setMembers((m.data ?? []).map((x: { student_id: string }) => x.student_id));
      const ids = list.filter((x) => x.kind === "assignment").map((x) => x.id);
      if (ids.length) {
        const s = await es.from("es_submissions").select("*, es_submission_files(*)").in("post_id", ids);
        if (s.error) setError(s.error.message);
        else setSubs((s.data ?? []) as Submission[]);
      } else setSubs([]);
    }
    setLoading(false);
  }, [es, cls.id]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    load();
  }, [load]);

  async function deleteClass() {
    if (
      !window.confirm(
        `Supprimer la classe « ${cls.name} » ? Les publications, devoirs et rendus de cette classe seront supprimés (tes fichiers de la bibliothèque sont conservés).`
      )
    )
      return;
    const { error } = await es.from("es_classes").delete().eq("id", cls.id);
    if (error) setError(error.message);
    else onDeleted();
  }

  async function removeMember(id: string) {
    const name = profiles.get(id)?.full_name || "cet élève";
    if (!window.confirm(`Retirer ${name} de la classe ?`)) return;
    const { error } = await es.from("es_members").delete().eq("class_id", cls.id).eq("student_id", id);
    if (error) setError(error.message);
    else await load();
  }

  return (
    <div className="class-view">
      <div className="class-head">
        <div>
          <h2>{cls.name}</h2>
          <p className="muted small">
            Code à donner aux élèves : <strong className="code">{cls.code}</strong>{" "}
            <button className="link" onClick={() => navigator.clipboard?.writeText(cls.code)}>Copier</button>
          </p>
        </div>
        <button className="danger" onClick={deleteClass}>Supprimer la classe</button>
      </div>

      <div className="tabs sub">
        <button className={tab === "posts" ? "on" : ""} onClick={() => setTab("posts")}>Publications</button>
        <button className={tab === "students" ? "on" : ""} onClick={() => setTab("students")}>
          Élèves ({members.length})
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {tab === "students" ? (
        members.length === 0 ? (
          <p className="muted empty">Aucun élève pour l&apos;instant. Donne-leur le code {cls.code}.</p>
        ) : (
          <ul className="list simple">
            {members.map((id) => (
              <li key={id}>
                <span className="text">{profiles.get(id)?.full_name || "(sans nom)"}</span>
                <span className="muted small">{profiles.get(id)?.email}</span>
                <span className="actions">
                  <button className="danger" onClick={() => removeMember(id)}>Retirer</button>
                </span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <Composer userId={userId} classId={cls.id} onCreated={load} />
          {loading ? (
            <p className="muted">Chargement…</p>
          ) : posts.length === 0 ? (
            <p className="muted empty">Rien de publié pour l&apos;instant.</p>
          ) : (
            <div className="posts">
              {posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  subs={subs.filter((s) => s.post_id === p.id)}
                  studentCount={members.length}
                  profiles={profiles}
                  onChanged={load}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ───────── Création d'une publication ─────────

function Composer({ userId, classId, onCreated }: { userId: string; classId: string; onCreated: () => void }) {
  const es = getEs();
  const [kind, setKind] = useState<PostKind>("resource");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const [published, setPublished] = useState(true);
  const [attached, setAttached] = useState<EsFile[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function addNew(list: FileList) {
    setError(null);
    setBusy("Envoi des fichiers…");
    const { created, errors } = await uploadToLibrary(Array.from(list), userId, null);
    setAttached((prev) => prev.concat(created));
    if (errors.length) setError(errors.join(" · "));
    setBusy(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("Publication…");
    const { data, error: pErr } = await es
      .from("es_posts")
      .insert({
        class_id: classId,
        kind,
        title: title.trim(),
        body: body.trim(),
        due_at: kind === "assignment" ? localToIso(due) : null,
        published,
      })
      .select("id")
      .single();
    if (pErr || !data) {
      setBusy(null);
      return setError(pErr?.message ?? "Erreur à la publication.");
    }
    if (attached.length) {
      const { error: fErr } = await es
        .from("es_post_files")
        .insert(attached.map((f) => ({ post_id: data.id, file_id: f.id })));
      if (fErr) setError(fErr.message);
    }
    setTitle("");
    setBody("");
    setDue("");
    setAttached([]);
    setBusy(null);
    onCreated();
  }

  return (
    <form className="card composer" onSubmit={submit}>
      <div className="row">
        <label>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as PostKind)}>
            <option value="resource">Ressource / contenu de cours</option>
            <option value="assignment">Devoir à rendre</option>
            <option value="announcement">Annonce</option>
          </select>
        </label>
        {kind === "assignment" && (
          <label>
            À rendre avant le
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        )}
      </div>
      <label>
        Titre
        <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. : Le passé composé — fiche d'exercices" />
      </label>
      <label>
        Consignes / description
        <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>

      <div className="attach-bar">
        <button type="button" onClick={() => setPicking(true)}>📚 Joindre depuis la bibliothèque</button>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => e.target.files && addNew(e.target.files)} />
        <button type="button" onClick={() => inputRef.current?.click()}>⬆ Téléverser des fichiers</button>
      </div>
      <Attachments files={attached} onRemove={(f) => setAttached((prev) => prev.filter((x) => x.id !== f.id))} />

      <div className="row end">
        <label className="check">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Visible tout de suite par les élèves
        </label>
        <button className="primary" disabled={busy !== null}>{busy ?? "Publier"}</button>
      </div>
      {error && <p className="error">{error}</p>}

      {picking && (
        <FilePicker
          selected={attached}
          onClose={() => setPicking(false)}
          onConfirm={(files) => {
            setAttached(files);
            setPicking(false);
          }}
        />
      )}
    </form>
  );
}

// ───────── Carte d'une publication ─────────

function PostCard({
  post,
  subs,
  studentCount,
  profiles,
  onChanged,
}: {
  post: Post;
  subs: Submission[];
  studentCount: number;
  profiles: Map<string, Profile>;
  onChanged: () => void;
}) {
  const es = getEs();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const files = postFiles(post);

  async function togglePublished() {
    const { error } = await es.from("es_posts").update({ published: !post.published }).eq("id", post.id);
    if (error) setError(error.message);
    else onChanged();
  }

  async function remove() {
    if (!window.confirm(`Supprimer « ${post.title} » ?${post.kind === "assignment" ? " Les rendus des élèves seront aussi supprimés." : ""}`)) return;
    const paths = subs.flatMap((s) => s.es_submission_files.map((f) => f.path));
    if (paths.length) await es.storage.from("espagnol").remove(paths);
    const { error } = await es.from("es_posts").delete().eq("id", post.id);
    if (error) setError(error.message);
    else onChanged();
  }

  return (
    <article className={`card post kind-${post.kind}${post.published ? "" : " draft"}`}>
      <header>
        <span className={`badge ${post.kind}`}>{KIND_LABEL[post.kind]}</span>
        {!post.published && <span className="badge draft">Brouillon (masqué)</span>}
        <span className="muted small date">{formatDateTime(post.created_at)}</span>
      </header>
      <h3>{post.title}</h3>
      {post.due_at && <p className="due small">📅 À rendre avant le {formatDateTime(post.due_at)}</p>}
      {post.body && <p className="body">{post.body}</p>}
      <Attachments files={files} />
      {error && <p className="error">{error}</p>}
      <div className="post-actions">
        {post.kind === "assignment" && (
          <button onClick={() => setOpen(!open)}>
            {open ? "Masquer" : "Voir"} les rendus ({subs.length}/{studentCount})
          </button>
        )}
        <button onClick={togglePublished}>{post.published ? "Masquer aux élèves" : "Publier"}</button>
        <button className="danger" onClick={remove}>Supprimer</button>
      </div>
      {open && (
        <div className="subs">
          {subs.length === 0 ? (
            <p className="muted small">Aucun rendu pour l&apos;instant.</p>
          ) : (
            subs
              .slice()
              .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
              .map((s) => (
                <SubmissionRow key={s.id} sub={s} due={post.due_at} student={profiles.get(s.student_id)} onSaved={onChanged} />
              ))
          )}
        </div>
      )}
    </article>
  );
}

function SubmissionRow({
  sub,
  due,
  student,
  onSaved,
}: {
  sub: Submission;
  due: string | null;
  student: Profile | undefined;
  onSaved: () => void;
}) {
  const [grade, setGrade] = useState(sub.grade ?? "");
  const [feedback, setFeedback] = useState(sub.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const late = due !== null && new Date(sub.submitted_at) > new Date(due);

  async function save() {
    setBusy(true);
    setMsg(null);
    const { error } = await getEs()
      .from("es_submissions")
      .update({ grade: grade.trim() || null, feedback: feedback.trim() || null })
      .eq("id", sub.id);
    setBusy(false);
    if (error) setMsg(error.message);
    else {
      setMsg("Enregistré ✓");
      onSaved();
    }
  }

  return (
    <div className="sub-row">
      <div className="sub-head">
        <strong>{student?.full_name || student?.email || "Élève"}</strong>
        <span className="muted small">
          rendu le {formatDateTime(sub.submitted_at)}
          {late && <span className="late"> · en retard</span>}
        </span>
      </div>
      {sub.body && <p className="body">{sub.body}</p>}
      <Attachments files={sub.es_submission_files} />
      <div className="grade-row">
        <input type="text" placeholder="Note (ex. 15/20)" value={grade} onChange={(e) => setGrade(e.target.value)} />
        <input type="text" placeholder="Commentaire pour l'élève" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <button onClick={save} disabled={busy}>Enregistrer</button>
      </div>
      {msg && <p className="muted small">{msg}</p>}
    </div>
  );
}
