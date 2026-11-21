"use client";

import { useEffect, useState } from "react";
import {
  DAYS,
  REMARK_LABEL,
  STATUS_LABEL,
  formatDateTime,
  formatShortDay,
  getEs,
  hhmm,
  type Attendance,
  type ClassRow,
  type Remark,
  type Slot,
} from "@/lib/espagnol";
import { slotTime } from "./Appel";

// Emploi du temps de la classe (lecture seule pour l'élève)
export function StudentTimetable({ classes }: { classes: ClassRow[] }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEs()
      .from("es_slots")
      .select("*")
      .order("start_time")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setSlots((data ?? []) as Slot[]);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="muted">Chargement…</p>;
  if (error) return <p className="error">{error}</p>;
  if (slots.length === 0) return <p className="muted empty">Pas encore d&apos;emploi du temps.</p>;

  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "";
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => slots.some((s) => s.weekday === d));

  return (
    <div className="week" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {days.map((wd) => (
        <div key={wd} className="day">
          <h3>{DAYS[wd - 1]}</h3>
          {slots
            .filter((s) => s.weekday === wd)
            .map((s) => (
              <div key={s.id} className="slot">
                <div className="slot-time">{slotTime(s)}</div>
                <div className="slot-class">{s.subject}</div>
                <div className="muted small">
                  {s.room ? `Salle ${s.room}` : ""}
                  {classes.length > 1 ? ` · ${className(s.class_id)}` : ""}
                </div>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

type AttRow = Attendance & { es_sessions: { date: string; start_time: string; end_time: string } | null };

// Absences, retards et observations de l'élève
export function StudentLife() {
  const [att, setAtt] = useState<AttRow[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const es = getEs();
    Promise.all([
      es.from("es_attendance").select("*, es_sessions(date,start_time,end_time)").neq("status", "present"),
      es.from("es_remarks").select("*").order("created_at", { ascending: false }),
    ]).then(([a, r]) => {
      if (a.error || r.error) setError((a.error ?? r.error)!.message);
      else {
        const rows = (a.data ?? []) as AttRow[];
        rows.sort((x, y) => (y.es_sessions?.date ?? "").localeCompare(x.es_sessions?.date ?? ""));
        setAtt(rows);
        setRemarks((r.data ?? []) as Remark[]);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="muted">Chargement…</p>;
  if (error) return <p className="error">{error}</p>;

  const absences = att.filter((a) => a.status === "absent");
  const lates = att.filter((a) => a.status === "late");

  return (
    <div>
      <div className="stats">
        <div className="card stat"><strong>{absences.length}</strong><span className="muted small">absence{absences.length > 1 ? "s" : ""}</span></div>
        <div className="card stat"><strong>{absences.filter((a) => !a.excused).length}</strong><span className="muted small">non justifiée{absences.filter((a) => !a.excused).length > 1 ? "s" : ""}</span></div>
        <div className="card stat"><strong>{lates.length}</strong><span className="muted small">retard{lates.length > 1 ? "s" : ""}</span></div>
        <div className="card stat"><strong>{remarks.length}</strong><span className="muted small">observation{remarks.length > 1 ? "s" : ""}</span></div>
      </div>

      <h3 className="sect">Absences et retards</h3>
      {att.length === 0 ? (
        <p className="muted empty">Rien à signaler 👍</p>
      ) : (
        <ul className="list simple">
          {att.map((a) => (
            <li key={a.session_id}>
              <span className="text">
                <span className={`badge att-${a.status}`}>
                  {STATUS_LABEL[a.status]}
                  {a.status === "late" && a.late_minutes ? ` ${a.late_minutes} min` : ""}
                </span>{" "}
                {a.es_sessions ? `${formatShortDay(a.es_sessions.date)} · ${hhmm(a.es_sessions.start_time)}` : ""}
                {a.reason ? ` · ${a.reason}` : ""}
              </span>
              <span className="muted small">{a.excused ? "Justifié" : "Non justifié"}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="sect">Observations</h3>
      {remarks.length === 0 ? (
        <p className="muted empty">Aucune observation.</p>
      ) : (
        <ul className="list simple">
          {remarks.map((r) => (
            <li key={r.id}>
              <span className="text">
                <span className={`badge remark-${r.kind}`}>{REMARK_LABEL[r.kind]}</span> {r.body}
              </span>
              <span className="muted small">{formatDateTime(r.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
