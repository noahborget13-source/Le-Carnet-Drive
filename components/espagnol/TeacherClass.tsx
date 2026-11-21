"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  KIND_LABEL,
  POST_SELECT,
  ensureLessonSession,
  lessonLabel,
  lessonStartIso,
  lessonsFor,
  postSortKey,
  sessionLabel,
  type Lesson,
  type Slot,
  addDays,
  formatDateTime,
  getEs,
  postFiles,
  uploadToLibrary,
  type AppelTarget,
  type ClassRow,
  type EsFile,
  type PostKind,
  type Post,
  type Profile,
  type Submission,
} from "@/lib/espagnol";
import Attachments from "./Attachments";
import FilePicker from "./FilePicker";
import StudentsPanel from "./StudentsPanel";
import ClassLife from "./ClassLife";

type Props = {
  userId: string;
  cls: ClassRow;
  profiles: Map<string, Profile>;
  onDeleted: () => void;
  onProfilesChanged: () => void;
  onOpenAppel: (t: AppelTarget) => void;
};

export default function TeacherClass({ userId, cls, profiles, onDeleted, onProfilesChanged, onOpenAppel }: Props) {
  const es = getEs();
  const [posts, setPosts] = useState<Post[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [codes, setCodes] = useState<Map<string, string>>(new Map());
  const [doneRows, setDoneRows] = useState<{ post_id: string; student_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"posts" | "students" | "life">("posts");

  const load = useCallback(async () => {
    const [p, m, k] = await Promise.all([
      es
        .from("es_posts")
        .select(POST_SELECT)
        .eq("class_id", cls.id),
      es.from("es_members").select("student_id").eq("class_id", cls.id),
      es.from("es_student_codes").select("user_id,code"),
    ]);
    if (p.error) setError(p.error.message);
    else if (m.error) setError(m.error.message);
    else if (k.error) setError(k.error.message);
    else {
      const list = ((p.data ?? []) as unknown as Post[]).sort((a, b) => postSortKey(b).localeCompare(postSortKey(a)));
      setPosts(list);
      const todoIds = list.filter((x) => x.kind === "todo").map((x) => x.id);
      if (todoIds.length) {
        const d = await es.from("es_post_done").select("post_id,student_id").in("post_id", todoIds);
        if (d.error) setError(d.error.message);
        else setDoneRows((d.data ?? []) as { post_id: string; student_id: string }[]);
      } else setDoneRows([]);
      setCodes(new Map(((k.data ?? []) as { user_id: string; code: string }[]).map((x): [string, string] => [x.user_id, x.code])));
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

  async function onStudentsChanged() {
    onProfilesChanged();
    await load();
  }

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

  return (
    <div className="class-view">
      <div className="class-head">
        <div>
          <h2>{cls.name}</h2>
        </div>
        <button className="danger" onClick={deleteClass}>Supprimer la classe</button>
      </div>

      <div className="tabs sub">
        <button className={tab === "posts" ? "on" : ""} onClick={() => setTab("posts")}>Publications</button>
        <button className={tab === "students" ? "on" : ""} onClick={() => setTab("students")}>
          Élèves ({members.length})
        </button>
        <button className={tab === "life" ? "on" : ""} onClick={() => setTab("life")}>Vie scolaire</button>
      </div>

      {error && <p className="error">{error}</p>}

      {tab === "life" ? (
        <ClassLife cls={cls} members={members} profiles={profiles} onOpenAppel={onOpenAppel} />
      ) : tab === "students" ? (
        <StudentsPanel
          classId={cls.id}
          className={cls.name}
          members={members}
          profiles={profiles}
          codes={codes}
          onChanged={onStudentsChanged}
        />
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
                  members={members}
                  doneBy={doneRows.filter((d) => d.post_id === p.id).map((d) => d.student_id)}
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
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [givenKey, setGivenKey] = useState("");
  const [dueKey, setDueKey] = useState("");
  const [published, setPublished] = useState(true);
  const [attached, setAttached] = useState<EsFile[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cours de la classe d'après l'emploi du temps : 3 semaines passées, 6 semaines à venir
  useEffect(() => {
    Promise.all([
      es.from("es_slots").select("*").eq("class_id", classId),
      es.from("es_settings").select("q1_monday").limit(1).maybeSingle(),
    ]).then(([s, st]) => {
      if (s.error) return setError(s.error.message);
      const now = new Date();
      const list = lessonsFor(
        (s.data ?? []) as Slot[],
        classId,
        (st.data as { q1_monday: string } | null)?.q1_monday ?? null,
        addDays(now, -21),
        addDays(now, 42)
      );
      setLessons(list);
      // par défaut : le cours du jour (ou le dernier cours passé), et le suivant pour l'échéance
      const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const past = list.filter((l) => l.key <= nowKey);
      const given = past[past.length - 1] ?? list[0];
      if (given) {
        setGivenKey(given.key);
        setDueKey(list.find((l) => l.key > given.key)?.key ?? "");
      }
    });
  }, [es, classId]);

  const hasDue = kind === "assignment" || kind === "todo";
  const dueOptions = lessons.filter((l) => !givenKey || l.key > givenKey);

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
    const given = lessons.find((l) => l.key === givenKey) ?? null;
    const due = hasDue ? (lessons.find((l) => l.key === dueKey) ?? null) : null;
    const sessionId = given ? await ensureLessonSession(classId, given) : null;
    const dueSessionId = due ? await ensureLessonSession(classId, due) : null;
    if ((given && !sessionId) || (due && !dueSessionId)) {
      setBusy(null);
      return setError("Impossible de rattacher la publication à ce cours.");
    }
    const { data, error: pErr } = await es
      .from("es_posts")
      .insert({
        class_id: classId,
        kind,
        title: title.trim(),
        body: body.trim(),
        session_id: sessionId,
        due_session_id: dueSessionId,
        due_at: due ? lessonStartIso(due) : null,
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
            <option value="todo">Travail à faire (rien à rendre)</option>
            <option value="assignment">Travail à rendre (les élèves déposent leur rendu)</option>
            <option value="announcement">Annonce</option>
          </select>
        </label>
      </div>
      <div className="row">
        <label>
          {hasDue ? "Donné au cours du" : "Cours concerné"}
          <select
            value={givenKey}
            onChange={(e) => {
              setGivenKey(e.target.value);
              // l'échéance doit rester après le cours où le travail est donné
              if (dueKey && dueKey <= e.target.value) setDueKey(lessons.find((l) => l.key > e.target.value)?.key ?? "");
            }}
          >
            <option value="">— Hors emploi du temps —</option>
            {lessons.map((l) => (
              <option key={l.key} value={l.key}>{lessonLabel(l)}</option>
            ))}
          </select>
        </label>
        {hasDue && (
          <label>
            {kind === "todo" ? "À faire pour le cours du" : "À rendre pour le cours du"}
            <select value={dueKey} onChange={(e) => setDueKey(e.target.value)}>
              <option value="">— Pas de date —</option>
              {dueOptions.map((l) => (
                <option key={l.key} value={l.key}>{lessonLabel(l)}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {lessons.length === 0 && (
        <p className="muted small">
          Ajoute d&apos;abord les créneaux de cette classe dans « Emploi du temps » pour rattacher tes publications à un cours précis.
        </p>
      )}
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
  members,
  doneBy,
  profiles,
  onChanged,
}: {
  post: Post;
  subs: Submission[];
  studentCount: number;
  members: string[];
  doneBy: string[];
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
      {error && <p className="error">{error}</p>}
      <div className="post-actions">
        {post.kind === "todo" && (
          <button onClick={() => setOpen(!open)}>
            {open ? "Masquer" : "Voir"} qui a fini ({doneBy.length}/{studentCount})
          </button>
        )}
        {post.kind === "assignment" && (
          <button onClick={() => setOpen(!open)}>
            {open ? "Masquer" : "Voir"} les rendus ({subs.length}/{studentCount})
          </button>
        )}
        <button onClick={togglePublished}>{post.published ? "Masquer aux élèves" : "Publier"}</button>
        <button className="danger" onClick={remove}>Supprimer</button>
      </div>
      {open && post.kind === "todo" && (
        <div className="subs">
          {members.length === 0 ? (
            <p className="muted small">Aucun élève dans la classe.</p>
          ) : (
            <>
              <p className="small">
                <strong>Ont fini :</strong>{" "}
                {members.filter((id) => doneBy.includes(id)).map((id) => profiles.get(id)?.full_name || "Élève").join(", ") || "personne pour l'instant"}
              </p>
              <p className="small">
                <strong>Pas encore :</strong>{" "}
                {members.filter((id) => !doneBy.includes(id)).map((id) => profiles.get(id)?.full_name || "Élève").join(", ") || "tout le monde a fini 🎉"}
              </p>
            </>
          )}
        </div>
      )}
      {open && post.kind === "assignment" && (
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
