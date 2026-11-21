"use client";

import { useCallback, useEffect, useState } from "react";
import {
  REMARK_LABEL,
  STATUS_LABEL,
  formatDateTime,
  formatShortDay,
  getEs,
  hhmm,
  type Attendance,
  type ClassRow,
  type Profile,
  type Remark,
  type RemarkKind,
  type Session,
} from "@/lib/espagnol";
import Appel, { RemarkForm, type AppelTarget } from "./Appel";

// Vie scolaire d'une classe : bilan par élève (absences, retards, observations) et historique des appels
export default function ClassLife({
  cls,
  members,
  profiles,
}: {
  cls: ClassRow;
  members: string[];
  profiles: Map<string, Profile>;
}) {
  const es = getEs();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [att, setAtt] = useState<Attendance[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [part, setPart] = useState<{ session_id: string; student_id: string; rating: number }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [appel, setAppel] = useState<AppelTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await es.from("es_sessions").select("*").eq("class_id", cls.id).order("date", { ascending: false });
    if (s.error) {
      setError(s.error.message);
      setLoading(false);
      return;
    }
    const list = (s.data ?? []) as Session[];
    setSessions(list);
    const ids = list.map((x) => x.id);
    const [a, r, p] = await Promise.all([
      ids.length ? es.from("es_attendance").select("*").in("session_id", ids) : Promise.resolve({ data: [], error: null }),
      es.from("es_remarks").select("*").eq("class_id", cls.id).order("created_at", { ascending: false }),
      ids.length ? es.from("es_participation").select("*").in("session_id", ids) : Promise.resolve({ data: [], error: null }),
    ]);
    if (a.error || r.error || p.error) setError((a.error ?? r.error ?? p.error)!.message);
    else {
      setAtt((a.data ?? []) as Attendance[]);
      setRemarks((r.data ?? []) as Remark[]);
      setPart((p.data ?? []) as { session_id: string; student_id: string; rating: number }[]);
    }
    setLoading(false);
  }, [es, cls.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addRemark(studentId: string, kind: RemarkKind, body: string, visible: boolean) {
    const { error } = await es.from("es_remarks").insert({
      class_id: cls.id,
      student_id: studentId,
      kind,
      body: body.trim(),
      visible_to_student: visible,
    });
    if (error) setError(error.message);
    else await load();
  }

  async function deleteRemark(id: string) {
    const { error } = await es.from("es_remarks").delete().eq("id", id);
    if (error) setError(error.message);
    else setRemarks((cur) => cur.filter((r) => r.id !== id));
  }

  const rows = members
    .map((id) => {
      const mine = att.filter((a) => a.student_id === id);
      return {
        id,
        name: profiles.get(id)?.full_name || "(sans nom)",
        absences: mine.filter((a) => a.status === "absent").length,
        unexcused: mine.filter((a) => a.status === "absent" && !a.excused).length,
        lates: mine.filter((a) => a.status === "late").length,
        remarks: remarks.filter((r) => r.student_id === id).length,
        ratings: part.filter((x) => x.student_id === id).map((x) => x.rating),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const sessionById = new Map(sessions.map((x): [string, Session] => [x.id, x]));
  const current = rows.find((r) => r.id === selected) ?? null;

  if (loading) return <p className="muted">Chargement…</p>;

  return (
    <div>
      {error && <p className="error">{error}</p>}

      <h3 className="sect">Bilan par élève</h3>
      {rows.length === 0 ? (
        <p className="muted empty">Aucun élève dans cette classe.</p>
      ) : (
        <div className="table-wrap">
          <table className="bilan">
            <thead>
              <tr>
                <th>Élève</th>
                <th>Absences</th>
                <th>dont non justifiées</th>
                <th>Retards</th>
                <th>Participation</th>
                <th>Observations</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.id === selected ? "sel" : ""} onClick={() => setSelected(r.id === selected ? null : r.id)}>
                  <td><button className="link">{r.name}</button></td>
                  <td>{r.absences}</td>
                  <td className={r.unexcused > 0 ? "warn" : ""}>{r.unexcused}</td>
                  <td>{r.lates}</td>
                  <td>
                    {r.ratings.length === 0
                      ? "—"
                      : `${(r.ratings.reduce((s, n) => s + n, 0) / r.ratings.length).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}/5 (${r.ratings.length})`}
                  </td>
                  <td>{r.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {current && (
        <div className="card student-detail">
          <h3>{current.name}</h3>
          <h4>Absences et retards</h4>
          {att.filter((a) => a.student_id === current.id && a.status !== "present").length === 0 ? (
            <p className="muted small">Aucune absence ni retard.</p>
          ) : (
            <ul className="plain">
              {att
                .filter((a) => a.student_id === current.id && a.status !== "present")
                .sort((a, b) => (sessionById.get(b.session_id)?.date ?? "").localeCompare(sessionById.get(a.session_id)?.date ?? ""))
                .map((a) => {
                  const s = sessionById.get(a.session_id);
                  return (
                    <li key={a.session_id} className="small">
                      <span className={`badge att-${a.status}`}>
                        {STATUS_LABEL[a.status]}
                        {a.status === "late" && a.late_minutes ? ` ${a.late_minutes} min` : ""}
                      </span>{" "}
                      {s ? `${formatShortDay(s.date)} ${hhmm(s.start_time)}` : ""}{" "}
                      {a.excused ? <em>· justifié</em> : <strong>· non justifié</strong>}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </li>
                  );
                })}
            </ul>
          )}
          <h4>Observations</h4>
          {remarks.filter((r) => r.student_id === current.id).length === 0 ? (
            <p className="muted small">Aucune observation.</p>
          ) : (
            <ul className="plain">
              {remarks
                .filter((r) => r.student_id === current.id)
                .map((r) => (
                  <li key={r.id} className="small">
                    <span className={`badge remark-${r.kind}`}>{REMARK_LABEL[r.kind]}</span> {r.body}{" "}
                    <span className="muted">· {formatDateTime(r.created_at)}{!r.visible_to_student ? " · privé" : ""}</span>{" "}
                    <button className="link" onClick={() => deleteRemark(r.id)}>Supprimer</button>
                  </li>
                ))}
            </ul>
          )}
          <RemarkForm onAdd={(kind, body, visible) => addRemark(current.id, kind, body, visible)} />
        </div>
      )}

      <h3 className="sect">Historique des appels</h3>
      {sessions.length === 0 ? (
        <p className="muted empty">Aucun appel pour l&apos;instant. Lance-le depuis l&apos;onglet « Emploi du temps ».</p>
      ) : (
        <ul className="list simple">
          {sessions.map((s) => {
            const a = att.filter((x) => x.session_id === s.id);
            return (
              <li key={s.id}>
                <span className="text">
                  {formatShortDay(s.date)} · {hhmm(s.start_time)}–{hhmm(s.end_time)}
                  {s.room ? ` · salle ${s.room}` : ""}
                  {s.topic ? ` — ${s.topic}` : ""}
                </span>
                <span className="muted small">
                  {a.filter((x) => x.status === "absent").length} abs. · {a.filter((x) => x.status === "late").length} ret.
                </span>
                <span className="actions">
                  <button
                    onClick={() =>
                      setAppel({
                        cls,
                        date: s.date,
                        start: hhmm(s.start_time),
                        end: hhmm(s.end_time),
                        room: s.room,
                        slotId: s.slot_id,
                      })
                    }
                  >
                    Ouvrir
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {appel && <Appel target={appel} profiles={profiles} onClose={() => setAppel(null)} onSaved={load} />}
    </div>
  );
}
