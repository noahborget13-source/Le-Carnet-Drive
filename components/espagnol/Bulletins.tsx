"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PERIODS,
  PERIOD_LABEL,
  fmtNote,
  getEs,
  periodRange,
  weightedAverage,
  type Assessment,
  type ClassRow,
  type Grade,
  type Period,
  type Profile,
  type Report,
} from "@/lib/espagnol";

// Bulletins : moyenne du trimestre (calculée d'après les notes) et appréciation de chaque élève
export default function Bulletins({ classes, profiles }: { classes: ClassRow[]; profiles: Map<string, Profile> }) {
  const es = getEs();
  const [classId, setClassId] = useState<string | null>(classes[0]?.id ?? null);
  const [period, setPeriod] = useState<Period>("T1");
  const [members, setMembers] = useState<string[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [reports, setReports] = useState<Map<string, Report>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classId) {
      setLoading(false);
      return;
    }
    const range = periodRange(period);
    const [m, a, r] = await Promise.all([
      es.from("es_members").select("student_id").eq("class_id", classId),
      es.from("es_assessments").select("*").eq("class_id", classId).gte("date", range.from).lte("date", range.to),
      es.from("es_reports").select("*").eq("class_id", classId).eq("period", period),
    ]);
    if (m.error || a.error || r.error) {
      setError((m.error ?? a.error ?? r.error)!.message);
      setLoading(false);
      return;
    }
    const alist = (a.data ?? []) as Assessment[];
    setMembers((m.data ?? []).map((x: { student_id: string }) => x.student_id));
    setAssessments(alist);
    setReports(new Map(((r.data ?? []) as Report[]).map((x): [string, Report] => [x.student_id, x])));
    if (alist.length) {
      const g = await es.from("es_grades").select("*").in("assessment_id", alist.map((x) => x.id));
      if (g.error) setError(g.error.message);
      else setGrades((g.data ?? []) as Grade[]);
    } else setGrades([]);
    setLoading(false);
  }, [es, classId, period]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    load();
  }, [load]);

  async function save(studentId: string, patch: Partial<Pick<Report, "comment" | "published">>) {
    if (!classId) return;
    const cur = reports.get(studentId);
    const next: Report = {
      class_id: classId,
      student_id: studentId,
      period,
      comment: cur?.comment ?? "",
      published: cur?.published ?? false,
      ...patch,
    };
    setReports((m) => new Map(m).set(studentId, next));
    const { error } = await es
      .from("es_reports")
      .upsert({ ...next, updated_at: new Date().toISOString() }, { onConflict: "class_id,student_id,period" });
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function publishAll(value: boolean) {
    for (const id of members) await save(id, { published: value });
  }

  const avgOf = (studentId: string) =>
    weightedAverage(
      assessments.map((a) => {
        const g = grades.find((x) => x.assessment_id === a.id && x.student_id === studentId);
        return { value: g?.value ?? null, absent: g?.absent ?? false, scale: a.scale, coef: a.coef };
      })
    );

  const rows = members
    .map((id) => ({ id, name: profiles.get(id)?.full_name || "(sans nom)" }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const classAvg = weightedAverage(rows.map((r) => ({ value: avgOf(r.id), absent: false, scale: 20, coef: 1 })));

  return (
    <div>
      <div className="notes-bar">
        <div className="class-picker">
          {classes.map((c) => (
            <button key={c.id} className={c.id === classId ? "on" : ""} onClick={() => setClassId(c.id)}>{c.name}</button>
          ))}
        </div>
        <span className="grow" />
        <div className="class-picker">
          {PERIODS.map((p) => (
            <button key={p} className={p === period ? "on" : ""} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Chargement…</p>
      ) : !classId ? (
        <p className="muted empty">Crée d&apos;abord une classe.</p>
      ) : rows.length === 0 ? (
        <p className="muted empty">Aucun élève dans cette classe.</p>
      ) : (
        <>
          <p className="small muted">
            {assessments.length} devoir{assessments.length > 1 ? "s" : ""} sur la période · moyenne de la classe : <strong>{fmtNote(classAvg)}</strong>
          </p>
          <div className="row end">
            <button onClick={() => publishAll(true)}>Publier tous les bulletins</button>
            <button onClick={() => publishAll(false)}>Tout masquer</button>
          </div>
          <div className="table-wrap">
            <table className="appel-table bulletin-table">
              <thead>
                <tr>
                  <th className="left">Élève</th>
                  <th>Moyenne</th>
                  <th className="left">Appréciation</th>
                  <th>Publié</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rep = reports.get(r.id);
                  return (
                    <tr key={r.id}>
                      <td className="left who-name">{r.name}</td>
                      <td><strong>{fmtNote(avgOf(r.id))}</strong></td>
                      <td className="left comment-cell">
                        <textarea
                          rows={2}
                          key={rep?.comment ?? ""}
                          defaultValue={rep?.comment ?? ""}
                          placeholder="Appréciation…"
                          maxLength={2000}
                          onBlur={(e) => e.target.value !== (rep?.comment ?? "") && save(r.id, { comment: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Publier le bulletin de ${r.name}`}
                          checked={rep?.published ?? false}
                          onChange={(e) => save(r.id, { published: e.target.checked })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
