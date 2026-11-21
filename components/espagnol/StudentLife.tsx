"use client";

import { useEffect, useState } from "react";
import {
  REMARK_LABEL,
  STATUS_LABEL,
  formatDateTime,
  formatShortDay,
  fmtNote,
  getEs,
  hhmm,
  weightedAverage,
  type Attendance,
  type ClassRow,
  type Remark,
} from "@/lib/espagnol";
import Timetable from "./Timetable";

// Emploi du temps de la classe (lecture seule pour l'élève, avec semaines Q1 / Q2)
export function StudentTimetable({ classes }: { classes: ClassRow[] }) {
  return <Timetable readOnly classes={classes} />;
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
      es
        .from("es_attendance")
        .select("*, es_sessions(date,start_time,end_time)")
        .or("status.neq.present,infirmary.eq.true,excluded.eq.true,exempt.eq.true"),
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
                {a.status !== "present" && (
                  <span className={`badge att-${a.status}`}>
                    {STATUS_LABEL[a.status]}
                    {a.status === "late" && a.late_minutes ? ` ${a.late_minutes} min` : ""}
                  </span>
                )}{" "}
                {a.infirmary && <span className="badge">Infirmerie</span>}{" "}
                {a.excluded && <span className="badge att-absent">Exclu(e) du cours</span>}{" "}
                {a.exempt && <span className="badge">Dispensé(e)</span>}{" "}
                {a.es_sessions ? `${formatShortDay(a.es_sessions.date)} · ${hhmm(a.es_sessions.start_time)}` : ""}
                {a.reason ? ` · ${a.reason}` : ""}
              </span>
              <span className="muted small">{a.status === "present" ? "" : a.excused ? "Justifié" : "Non justifié"}</span>
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

type GradeRow = {
  value: number | null;
  absent: boolean;
  es_assessments: { title: string; date: string; scale: number; coef: number } | null;
};

// Notes publiées par le professeur
export function StudentNotes() {
  const [rows, setRows] = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEs()
      .from("es_grades")
      .select("value,absent,es_assessments(title,date,scale,coef)")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          const list = (data ?? []) as unknown as GradeRow[];
          list.sort((a, b) => (b.es_assessments?.date ?? "").localeCompare(a.es_assessments?.date ?? ""));
          setRows(list);
        }
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="muted">Chargement…</p>;
  if (error) return <p className="error">{error}</p>;

  const avg = weightedAverage(
    rows
      .filter((r) => r.es_assessments)
      .map((r) => ({ value: r.value, absent: r.absent, scale: r.es_assessments!.scale, coef: r.es_assessments!.coef }))
  );

  return (
    <div>
      <div className="stats">
        <div className="card stat"><strong>{fmtNote(avg)}</strong><span className="muted small">moyenne /20</span></div>
        <div className="card stat"><strong>{rows.length}</strong><span className="muted small">note{rows.length > 1 ? "s" : ""}</span></div>
      </div>
      <h3 className="sect">Mes notes</h3>
      {rows.length === 0 ? (
        <p className="muted empty">Aucune note publiée pour l&apos;instant.</p>
      ) : (
        <ul className="list simple">
          {rows.map((r, i) => (
            <li key={i}>
              <span className="text">
                {r.es_assessments?.title}{" "}
                <span className="muted small">
                  · {r.es_assessments ? formatShortDay(r.es_assessments.date) : ""} · coef {r.es_assessments?.coef}
                </span>
              </span>
              <strong>
                {r.absent ? "Absent" : `${fmtNote(r.value)} / ${r.es_assessments?.scale ?? 20}`}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
