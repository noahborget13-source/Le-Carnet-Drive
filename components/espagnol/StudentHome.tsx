"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DAYS,
  addDays,
  fmtNote,
  formatShortDay,
  getEs,
  hhmm,
  mondayOf,
  POST_SELECT,
  toYmd,
  weekKindOf,
  type ClassRow,
  type Message,
  type Post,
  type Slot,
} from "@/lib/espagnol";

export type StudentTab = "home" | "work" | "timetable" | "notes" | "skills" | "reports" | "life" | "messages";

type GradeRow = { value: number | null; absent: boolean; es_assessments: { title: string; date: string; scale: number } | null };
type AttRow = { status: string; excused: boolean; es_sessions: { date: string; start_time: string; end_time: string } | null };

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// Page d'accueil de l'élève façon Pronote : cartes (emploi du temps du jour, travail à faire, notes, carnet…)
export default function StudentHome({
  userId,
  classes,
  onGo,
}: {
  userId: string;
  classes: ClassRow[];
  onGo: (t: StudentTab) => void;
}) {
  const es = getEs();
  const [day, setDay] = useState<Date>(() => addDays(new Date(), new Date().getHours() >= 17 ? 1 : 0));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [q1, setQ1] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [att, setAtt] = useState<AttRow[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, st, p, d, g, a, m] = await Promise.all([
      es.from("es_slots").select("*").order("start_time"),
      es.from("es_settings").select("q1_monday").limit(1).maybeSingle(),
      es.from("es_posts").select(POST_SELECT),
      es.from("es_post_done").select("post_id"),
      es.from("es_grades").select("value,absent,es_assessments(title,date,scale)"),
      es
        .from("es_attendance")
        .select("status,excused,es_sessions(date,start_time,end_time)")
        .neq("status", "present"),
      es.from("es_messages").select("*").order("created_at", { ascending: false }),
    ]);
    const err = [s, st, p, d, g, a, m].find((x) => x.error);
    if (err?.error) setError(err.error.message);
    setSlots((s.data ?? []) as Slot[]);
    setQ1((st.data as { q1_monday: string } | null)?.q1_monday ?? null);
    setPosts((p.data ?? []) as unknown as Post[]);
    setDone(new Set((d.data ?? []).map((x: { post_id: string }) => x.post_id)));
    const gl = (g.data ?? []) as unknown as GradeRow[];
    gl.sort((x, y) => (y.es_assessments?.date ?? "").localeCompare(x.es_assessments?.date ?? ""));
    setGrades(gl);
    const al = (a.data ?? []) as unknown as AttRow[];
    al.sort((x, y) => (y.es_sessions?.date ?? "").localeCompare(x.es_sessions?.date ?? ""));
    setAtt(al);
    setMessages((m.data ?? []) as Message[]);
    setLoading(false);
  }, [es]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleDone(postId: string) {
    const isDone = done.has(postId);
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

  if (loading) return <p className="muted">Chargement…</p>;

  const classOf = new Map(classes.map((c): [string, ClassRow] => [c.id, c]));
  const today = toYmd(new Date());
  const tomorrow = toYmd(addDays(new Date(), 1));
  const wd = ((day.getDay() + 6) % 7) + 1;
  const kind = weekKindOf(mondayOf(day), q1);
  const daySlots = slots
    .filter((s) => s.weekday === wd && (s.week === "all" || s.week === kind))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const dayLabel =
    toYmd(day) === today ? "Aujourd'hui" : toYmd(day) === tomorrow ? "Demain" : `${DAYS[wd - 1]} ${formatShortDay(toYmd(day)).replace(/^\S+\s/, "")}`;

  // Travail à faire à partir d'aujourd'hui, regroupé par échéance
  const dueDate = (p: Post): string | null => (p.due ? p.due.date : p.due_at ? toYmd(new Date(p.due_at)) : null);
  const upcoming = posts
    .filter((p) => (p.kind === "todo" || p.kind === "assignment") && dueDate(p) !== null && dueDate(p)! >= today)
    .sort((a, b) => dueDate(a)!.localeCompare(dueDate(b)!));
  const groups = new Map<string, Post[]>();
  for (const p of upcoming) groups.set(dueDate(p)!, [...(groups.get(dueDate(p)!) ?? []), p]);

  const infos = messages.filter((m) => m.student_id === null);
  const fromTeacher = messages.filter((m) => m.student_id === userId && m.sender_id !== userId);

  return (
    <div className="sh-grid">
      {error && <p className="error sh-wide">{error}</p>}

      <section className="widget">
        <button className="see-all" onClick={() => onGo("timetable")}>Tout voir ↗</button>
        <div className="day-nav">
          <button className="round" onClick={() => setDay(addDays(day, -1))} aria-label="Jour précédent">‹</button>
          <span className="pill">{dayLabel}</span>
          <button className="round" onClick={() => setDay(addDays(day, 1))} aria-label="Jour suivant">›</button>
        </div>
        <p className="center-week">Semaine {kind.toUpperCase()}</p>
        {daySlots.length === 0 ? (
          <p className="muted center">Pas de cours</p>
        ) : (
          <ul className="sh-lessons">
            {daySlots.map((s) => {
              const idx = Math.max(0, classes.findIndex((c) => c.id === s.class_id));
              return (
                <li key={s.id}>
                  <span className="lt">{hhmm(s.start_time)}<br /><span className="muted">{hhmm(s.end_time)}</span></span>
                  <span className="bar" style={{ background: `hsl(${(idx * 57 + 150) % 360} 55% 45%)` }} />
                  <span className="ls">
                    <strong>{(s.subject || "Espagnol").toUpperCase()}</strong>
                    <span className="muted">{classes.length > 1 ? classOf.get(s.class_id)?.name : ""}{s.room ? ` ${s.room}` : ""}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {daySlots.length > 0 && <span className="hidden">{minutes(daySlots[0].start_time)}</span>}
      </section>

      <section className="widget sh-work">
        <button className="see-all" onClick={() => onGo("work")}>Tout voir ↗</button>
        <h3>Travail à faire pour les prochains jours</h3>
        {groups.size === 0 ? (
          <p className="muted center">Rien à faire pour les prochains jours 🎉</p>
        ) : (
          Array.from(groups.entries()).map(([date, list]) => (
            <div key={date}>
              <div className="mint-head">
                Pour <strong>{date === today ? "aujourd'hui" : date === tomorrow ? "demain" : formatShortDay(date)}</strong>
              </div>
              {list.map((p) => (
                <div key={p.id} className="work-item">
                  <div className="wi-top">
                    <span className="wi-class">{classOf.get(p.class_id)?.name ?? ""}</span>
                    {p.kind === "todo" ? (
                      <span className={`tag ${done.has(p.id) ? "ok" : ""}`}>{done.has(p.id) ? "Fait" : "Non Fait"}</span>
                    ) : (
                      <span className="tag">À rendre</span>
                    )}
                  </div>
                  <strong>{p.title}</strong>
                  {p.body && <p className="wi-body">{p.body}</p>}
                  {p.kind === "todo" && (
                    <label className="wi-check">
                      <input type="checkbox" checked={done.has(p.id)} onChange={() => toggleDone(p.id)} /> J&apos;ai terminé
                    </label>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      <div className="sh-col">
        <section className="widget">
          <button className="see-all" onClick={() => onGo("life")}>Tout voir ↗</button>
          <h3>Carnet de correspondance</h3>
          {att.length === 0 ? (
            <p className="muted center">Rien à signaler</p>
          ) : (
            att.slice(0, 3).map((a, i) => (
              <p key={i} className="carnet">
                <strong>{a.status === "absent" ? (a.excused ? "Absence justifiée" : "Absence non justifiée") : "Retard"}</strong>
                <br />
                {a.es_sessions ? `le ${formatShortDay(a.es_sessions.date)} à ${hhmm(a.es_sessions.start_time)}` : ""}
              </p>
            ))
          )}
        </section>

        <section className="widget">
          <button className="see-all" onClick={() => onGo("notes")}>Tout voir ↗</button>
          <h3>Dernières notes</h3>
          {grades.length === 0 ? (
            <p className="muted center">Aucune note</p>
          ) : (
            grades.slice(0, 8).map((g, i) => (
              <div key={i} className="grade-line">
                <span>
                  <strong>{g.es_assessments?.title}</strong>
                  <br />
                  <span className="muted">{g.es_assessments ? `le ${formatShortDay(g.es_assessments.date)}` : ""}</span>
                </span>
                <span className="grade-pill">
                  {g.absent ? "Abs" : fmtNote(g.value)}
                  {!g.absent && g.es_assessments && g.es_assessments.scale !== 20 ? <small> /{g.es_assessments.scale}</small> : null}
                </span>
              </div>
            ))
          )}
        </section>
      </div>

      <div className="sh-col">
        <section className="widget">
          <button className="see-all" onClick={() => onGo("messages")}>Tout voir ↗</button>
          <h3>Informations &amp; Sondages</h3>
          {infos.length === 0 ? (
            <p className="muted center">Aucune nouvelle information</p>
          ) : (
            infos.slice(0, 2).map((m) => <p key={m.id} className="carnet">{m.body}</p>)
          )}
        </section>
        <section className="widget">
          <button className="see-all" onClick={() => onGo("messages")}>Tout voir ↗</button>
          <h3>Discussions</h3>
          {fromTeacher.length === 0 ? (
            <p className="muted center">Aucun nouveau message</p>
          ) : (
            <p className="carnet">{fromTeacher[0].body}</p>
          )}
        </section>
      </div>
    </div>
  );
}
