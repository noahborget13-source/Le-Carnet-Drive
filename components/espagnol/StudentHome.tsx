"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DAYS,
  addDays,
  formatShortDay,
  getEs,
  hhmm,
  mondayOf,
  POST_SELECT,
  toYmd,
  weekKindOf,
  type ClassRow,
  type Post,
  type Slot,
} from "@/lib/espagnol";

export type StudentTab = "home" | "work" | "resources" | "timetable" | "messages";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, st, p, d] = await Promise.all([
      es.from("es_slots").select("*").order("start_time"),
      es.from("es_settings").select("q1_monday").limit(1).maybeSingle(),
      es.from("es_posts").select(POST_SELECT),
      es.from("es_post_done").select("post_id"),
    ]);
    const err = [s, st, p, d].find((x) => x.error);
    if (err?.error) setError(err.error.message);
    setSlots((s.data ?? []) as Slot[]);
    setQ1((st.data as { q1_monday: string } | null)?.q1_monday ?? null);
    setPosts((p.data ?? []) as unknown as Post[]);
    setDone(new Set((d.data ?? []).map((x: { post_id: string }) => x.post_id)));
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

    </div>
  );
}
