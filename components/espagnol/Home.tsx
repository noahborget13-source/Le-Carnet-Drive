"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  appelKey,
  formatDateTime,
  formatShortDay,
  getEs,
  hhmm,
  mondayOf,
  toYmd,
  weekKindOf,
  type AppelTarget,
  type ClassRow,
  type Profile,
  type Session,
  type Slot,
} from "@/lib/espagnol";

type DuePost = { id: string; class_id: string; kind: string; title: string; due_at: string };
type ToGrade = { id: string; student_id: string; submitted_at: string; es_posts: { title: string; class_id: string } | null };

// Accueil du prof : cours du jour, appels à faire, travaux à venir, rendus à corriger
export default function Home({
  classes,
  profiles,
  onOpenAppel,
  onGo,
}: {
  classes: ClassRow[];
  profiles: Map<string, Profile>;
  onOpenAppel: (t: AppelTarget) => void;
  onGo: (tab: "timetable" | "classes") => void;
}) {
  const es = getEs();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [q1, setQ1] = useState<string | null>(null);
  const [due, setDue] = useState<DuePost[]>([]);
  const [toGrade, setToGrade] = useState<ToGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const today = toYmd(now);
  const from = toYmd(addDays(now, -14));

  useEffect(() => {
    Promise.all([
      es.from("es_slots").select("*").order("start_time"),
      es.from("es_settings").select("q1_monday").limit(1).maybeSingle(),
      es.from("es_sessions").select("*").gte("date", from).lte("date", today),
      es
        .from("es_posts")
        .select("id,class_id,kind,title,due_at")
        .in("kind", ["todo", "assignment"])
        .not("due_at", "is", null)
        .gte("due_at", now.toISOString())
        .order("due_at")
        .limit(6),
      es
        .from("es_submissions")
        .select("id,student_id,submitted_at,es_posts(title,class_id)")
        .is("grade", null)
        .order("submitted_at", { ascending: false })
        .limit(8),
    ]).then(([s, st, x, d, g]) => {
      const err = s.error ?? st.error ?? x.error ?? d.error ?? g.error;
      if (err) setError(err.message);
      else {
        setSlots((s.data ?? []) as Slot[]);
        setQ1((st.data as { q1_monday: string } | null)?.q1_monday ?? null);
        setSessions((x.data ?? []) as Session[]);
        setDue((d.data ?? []) as DuePost[]);
        setToGrade((g.data ?? []) as unknown as ToGrade[]);
      }
      setLoading(false);
    });
  }, [es, from, today, now]);

  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "Classe";

  // Occurrences de cours des 14 derniers jours (jusqu'à aujourd'hui)
  const occurrences = useMemo(() => {
    const out: { slot: Slot; date: string }[] = [];
    for (let i = 0; i <= 14; i++) {
      const day = addDays(now, -i);
      const wd = ((day.getDay() + 6) % 7) + 1;
      const kind = weekKindOf(mondayOf(day), q1);
      for (const s of slots) {
        if (s.weekday === wd && (s.week === "all" || s.week === kind)) out.push({ slot: s, date: toYmd(day) });
      }
    }
    return out;
  }, [slots, q1, now]);

  const target = (s: Slot, date: string): AppelTarget | null => {
    const cls = classes.find((c) => c.id === s.class_id);
    return cls ? { cls, date, start: hhmm(s.start_time), end: hhmm(s.end_time), room: s.room, slotId: s.id } : null;
  };
  const sessionOf = (s: Slot, date: string) =>
    sessions.find((x) => x.class_id === s.class_id && x.date === date && hhmm(x.start_time) === hhmm(s.start_time));

  const nowHm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todays = occurrences.filter((o) => o.date === today).sort((a, b) => a.slot.start_time.localeCompare(b.slot.start_time));
  const pending = occurrences
    .filter((o) => (o.date < today || hhmm(o.slot.end_time) <= nowHm) && !sessionOf(o.slot, o.date)?.validated_at)
    .sort((a, b) => (b.date + b.slot.start_time).localeCompare(a.date + a.slot.start_time));

  if (loading) return <p className="muted">Chargement…</p>;

  return (
    <div className="home">
      {error && <p className="error">{error}</p>}
      {classes.length === 0 && (
        <div className="widget wide">
          <h3>Bienvenue 👋</h3>
          <p>
            Commence par créer une classe dans <button className="link" onClick={() => onGo("classes")}>Cahier de textes</button>,
            ajoute tes élèves (un code de connexion est généré pour chacun), puis remplis ton{" "}
            <button className="link" onClick={() => onGo("timetable")}>emploi du temps</button>.
          </p>
        </div>
      )}

      <section className="widget">
        <h3>Mes cours aujourd&apos;hui</h3>
        {todays.length === 0 ? (
          <p className="muted small">Pas de cours aujourd&apos;hui.</p>
        ) : (
          <ul className="wlist">
            {todays.map(({ slot, date }) => {
              const t = target(slot, date);
              const done = !!sessionOf(slot, date)?.validated_at;
              return (
                <li key={slot.id + date}>
                  <span className="when">{hhmm(slot.start_time)}–{hhmm(slot.end_time)}</span>
                  <span className="what">
                    <strong>{className(slot.class_id)}</strong>
                    <span className="muted small">{slot.subject}{slot.room ? ` · salle ${slot.room}` : ""}</span>
                  </span>
                  {done ? (
                    <span className="ok small">✓ Appel fait</span>
                  ) : (
                    <button className="primary" onClick={() => t && onOpenAppel(t)}>Appel</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="widget">
        <h3>Appels à faire {pending.length > 0 && <span className="count">{pending.length}</span>}</h3>
        {pending.length === 0 ? (
          <p className="muted small">Tous tes appels sont à jour ✓</p>
        ) : (
          <ul className="wlist">
            {pending.slice(0, 8).map(({ slot, date }) => {
              const t = target(slot, date);
              return (
                <li key={slot.id + date}>
                  <span className="when">{formatShortDay(date)}<br />{hhmm(slot.start_time)}</span>
                  <span className="what"><strong>{className(slot.class_id)}</strong></span>
                  <button onClick={() => t && onOpenAppel(t)} data-key={t ? appelKey(t) : ""}>Faire l&apos;appel</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="widget">
        <h3>Travaux à venir</h3>
        {due.length === 0 ? (
          <p className="muted small">Aucune date limite à venir.</p>
        ) : (
          <ul className="wlist">
            {due.map((p) => (
              <li key={p.id}>
                <span className="when">{formatShortDay(p.due_at.slice(0, 10))}</span>
                <span className="what">
                  <strong>{p.title}</strong>
                  <span className="muted small">{className(p.class_id)} · {p.kind === "todo" ? "à faire" : "à rendre"}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="widget">
        <h3>Rendus à corriger {toGrade.length > 0 && <span className="count">{toGrade.length}</span>}</h3>
        {toGrade.length === 0 ? (
          <p className="muted small">Aucun rendu en attente de note.</p>
        ) : (
          <ul className="wlist">
            {toGrade.map((g) => (
              <li key={g.id}>
                <span className="what">
                  <strong>{profiles.get(g.student_id)?.full_name || "Élève"}</strong>
                  <span className="muted small">{g.es_posts?.title ?? ""} · {formatDateTime(g.submitted_at)}</span>
                </span>
                <button onClick={() => onGo("classes")}>Voir</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

