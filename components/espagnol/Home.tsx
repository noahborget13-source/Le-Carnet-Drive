"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  formatDateTime,
  formatShortDay,
  getEs,
  hhmm,
  mondayOf,
  toYmd,
  weekKindOf,
  type ClassRow,
  type Profile,
  type Slot,
} from "@/lib/espagnol";

type DuePost = { id: string; class_id: string; kind: string; title: string; due_at: string };
type ToGrade = { id: string; student_id: string; submitted_at: string; es_posts: { title: string; class_id: string } | null };

// Accueil du prof : cours du jour, travaux à venir, rendus à corriger
export default function Home({
  classes,
  profiles,
  onGo,
}: {
  classes: ClassRow[];
  profiles: Map<string, Profile>;
  onGo: (tab: "timetable" | "classes") => void;
}) {
  const es = getEs();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [q1, setQ1] = useState<string | null>(null);
  const [due, setDue] = useState<DuePost[]>([]);
  const [toGrade, setToGrade] = useState<ToGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    Promise.all([
      es.from("es_slots").select("*").order("start_time"),
      es.from("es_settings").select("q1_monday").limit(1).maybeSingle(),
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
    ]).then(([s, st, d, g]) => {
      const err = s.error ?? st.error ?? d.error ?? g.error;
      if (err) setError(err.message);
      else {
        setSlots((s.data ?? []) as Slot[]);
        setQ1((st.data as { q1_monday: string } | null)?.q1_monday ?? null);
        setDue((d.data ?? []) as DuePost[]);
        setToGrade((g.data ?? []) as unknown as ToGrade[]);
      }
      setLoading(false);
    });
  }, [es, now]);

  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "Classe";
  const wd = ((now.getDay() + 6) % 7) + 1;
  const kind = weekKindOf(mondayOf(now), q1);
  const todays = slots
    .filter((s) => s.weekday === wd && (s.week === "all" || s.week === kind))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

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
          <p className="muted small">Pas de cours aujourd&apos;hui ({formatShortDay(toYmd(addDays(now, 0)))}).</p>
        ) : (
          <ul className="wlist">
            {todays.map((slot) => (
              <li key={slot.id}>
                <span className="when">{hhmm(slot.start_time)}–{hhmm(slot.end_time)}</span>
                <span className="what">
                  <strong>{className(slot.class_id)}</strong>
                  <span className="muted small">{slot.subject}{slot.room ? ` · salle ${slot.room}` : ""}</span>
                </span>
                <button onClick={() => onGo("classes")}>Saisir</button>
              </li>
            ))}
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
