"use client";

import { useDialog } from "../Dialogs";
import { useCallback, useEffect, useState } from "react";
import {
  KIND_LABEL,
  POST_SELECT,
  appelKey,
  formatDay,
  getEs,
  postFiles,
  sessionLabel,
  type AppelTarget,
  type ClassRow,
  type Lesson,
  type Post,
} from "@/lib/espagnol";
import Attachments from "./Attachments";
import { Composer } from "./TeacherClass";
import Timetable from "./Timetable";

// Saisie du cahier de textes façon Pronote : on choisit le cours dans l'emploi du temps (à gauche),
// puis le contenu (en haut) et le travail à faire (en bas) s'ajoutent à droite
export default function CahierSaisie({ classes, userId }: { classes: ClassRow[]; userId: string }) {
  const dialog = useDialog();
  const es = getEs();
  const [target, setTarget] = useState<AppelTarget | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!target) return;
    const s = await es
      .from("es_sessions")
      .select("id")
      .eq("class_id", target.cls.id)
      .eq("date", target.date)
      .eq("start_time", `${target.start}:00`)
      .maybeSingle();
    if (s.error) return setError(s.error.message);
    if (!s.data) return setPosts([]);
    const p = await es
      .from("es_posts")
      .select(POST_SELECT)
      .eq("class_id", target.cls.id)
      .eq("session_id", (s.data as { id: string }).id)
      .order("created_at");
    if (p.error) setError(p.error.message);
    else setPosts((p.data ?? []) as unknown as Post[]);
  }, [es, target]);

  useEffect(() => {
    setPosts([]);
    setEditing(null);
    setError(null);
    load();
  }, [load]);

  async function remove(p: Post) {
    if (!(await dialog.confirm({ title: "Supprimer cette publication ?", message: `« ${p.title} »${p.kind === "assignment" ? "\nLes rendus des élèves seront aussi supprimés." : ""}`, confirmLabel: "Supprimer" }))) return;
    const { error } = await es.from("es_posts").delete().eq("id", p.id);
    if (error) setError(error.message);
    else await load();
  }

  const lesson: Lesson | null = target
    ? {
        key: `${target.date}T${target.start}`,
        date: target.date,
        start: target.start,
        end: target.end,
        room: target.room,
        slotId: target.slotId ?? "",
      }
    : null;

  const content = posts.filter((p) => p.kind === "resource" || p.kind === "announcement");
  const homework = posts.filter((p) => p.kind === "todo" || p.kind === "assignment");

  function list(items: Post[]) {
    return items.map((p) =>
      editing === p.id ? (
        <Composer
          key={p.id}
          userId={userId}
          classId={p.class_id}
          post={p}
          onCancel={() => setEditing(null)}
          onCreated={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : (
        <article key={p.id} className={`card post kind-${p.kind}${p.published ? "" : " draft"}`}>
          <header>
            <span className={`badge ${p.kind}`}>{KIND_LABEL[p.kind]}</span>
            {!p.published && <span className="badge draft">Brouillon (masqué)</span>}
            {p.due && <span className="muted small date">Pour le cours du {sessionLabel(p.due)}</span>}
          </header>
          <h3>{p.title}</h3>
          {p.body && <p className="body">{p.body}</p>}
          <Attachments files={postFiles(p)} />
          <div className="post-actions">
            <button onClick={() => setEditing(p.id)}>✏️ Modifier</button>
            <button className="danger" onClick={() => remove(p)}>Supprimer</button>
          </div>
        </article>
      )
    );
  }

  return (
    <div className="appel-page">
      <aside className="appel-side">
        <h3>Choisir le cours</h3>
        <Timetable
          picker
          classes={classes}
          selectedKey={target ? appelKey(target) : null}
          onSelect={setTarget}
        />
      </aside>
      <div className="appel-main">
        {!target || !lesson ? (
          <p className="muted empty">Choisis un cours dans l&apos;emploi du temps à gauche pour saisir son contenu et son travail à faire.</p>
        ) : (
          <div className="cahier-sheet" key={appelKey(target)}>
            <div className="appel-title">
              <div>
                <h2>{target.cls.name}</h2>
                <p className="muted small">
                  {formatDay(target.date)} · {target.start}–{target.end}
                  {target.room ? ` · salle ${target.room}` : ""}
                </p>
              </div>
            </div>
            {error && <p className="error">{error}</p>}

            <h3 className="part-title">Contenu du cours</h3>
            {list(content)}
            <Composer userId={userId} classId={target.cls.id} lesson={lesson} section="content" onCreated={load} />

            <h3 className="part-title">Travail à faire</h3>
            {list(homework)}
            <Composer userId={userId} classId={target.cls.id} lesson={lesson} section="homework" onCreated={load} />
          </div>
        )}
      </div>
    </div>
  );
}
