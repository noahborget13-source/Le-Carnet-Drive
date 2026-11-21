"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fmtNote,
  formatShortDay,
  getEs,
  weightedAverage,
  type Assessment,
  type ClassRow,
  type Grade,
  type Profile,
} from "@/lib/espagnol";

// Saisie des notes façon Pronote : tableau élèves × devoirs, moyennes calculées
export default function Notes({ classes, profiles }: { classes: ClassRow[]; profiles: Map<string, Profile> }) {
  const es = getEs();
  const [classId, setClassId] = useState<string | null>(classes[0]?.id ?? null);
  const [members, setMembers] = useState<string[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [grades, setGrades] = useState<Map<string, Grade>>(new Map());
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const gkey = (a: string, s: string) => `${a}|${s}`;

  const load = useCallback(async () => {
    if (!classId) {
      setLoading(false);
      return;
    }
    const [m, a] = await Promise.all([
      es.from("es_members").select("student_id").eq("class_id", classId),
      es.from("es_assessments").select("*").eq("class_id", classId).order("date"),
    ]);
    if (m.error || a.error) {
      setError((m.error ?? a.error)!.message);
      setLoading(false);
      return;
    }
    const list = (a.data ?? []) as Assessment[];
    setMembers((m.data ?? []).map((x: { student_id: string }) => x.student_id));
    setAssessments(list);
    if (list.length) {
      const g = await es.from("es_grades").select("*").in("assessment_id", list.map((x) => x.id));
      if (g.error) setError(g.error.message);
      else setGrades(new Map(((g.data ?? []) as Grade[]).map((x): [string, Grade] => [gkey(x.assessment_id, x.student_id), x])));
    } else setGrades(new Map());
    setLoading(false);
  }, [es, classId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    load();
  }, [load]);

  async function saveGrade(a: Assessment, studentId: string, raw: string) {
    const text = raw.trim().toLowerCase().replace(",", ".");
    const key = gkey(a.id, studentId);
    const isAbs = text === "abs" || text === "a";
    const num = text === "" || isAbs ? null : Number(text);
    if (num !== null && (Number.isNaN(num) || num < 0 || num > a.scale)) {
      setError(`Note invalide (entre 0 et ${a.scale}, ou « abs »).`);
      return;
    }
    setError(null);
    const cur = grades.get(key);
    if (num === null && !isAbs) {
      if (!cur) return;
      setGrades((g) => {
        const m = new Map(g);
        m.delete(key);
        return m;
      });
      const { error } = await es.from("es_grades").delete().eq("assessment_id", a.id).eq("student_id", studentId);
      if (error) setError(error.message);
      return;
    }
    if (cur && cur.value === num && cur.absent === isAbs) return;
    const row: Grade = { assessment_id: a.id, student_id: studentId, value: num, absent: isAbs };
    setGrades((g) => new Map(g).set(key, row));
    const { error } = await es
      .from("es_grades")
      .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "assessment_id,student_id" });
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function togglePublished(a: Assessment) {
    const { error } = await es.from("es_assessments").update({ published: !a.published }).eq("id", a.id);
    if (error) setError(error.message);
    else setAssessments((cur) => cur.map((x) => (x.id === a.id ? { ...x, published: !a.published } : x)));
  }

  async function removeAssessment(a: Assessment) {
    if (!window.confirm(`Supprimer le devoir « ${a.title} » et toutes ses notes ?`)) return;
    const { error } = await es.from("es_assessments").delete().eq("id", a.id);
    if (error) setError(error.message);
    else await load();
  }

  const rows = members
    .map((id) => ({ id, name: profiles.get(id)?.full_name || "(sans nom)" }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const avgOf = (studentId: string) =>
    weightedAverage(
      assessments.map((a) => {
        const g = grades.get(gkey(a.id, studentId));
        return { value: g?.value ?? null, absent: g?.absent ?? false, scale: a.scale, coef: a.coef };
      })
    );
  const classAvgOf = (a: Assessment) =>
    weightedAverage(
      rows.map((r) => {
        const g = grades.get(gkey(a.id, r.id));
        return { value: g?.value ?? null, absent: g?.absent ?? false, scale: a.scale, coef: 1 };
      })
    );
  const generalAvg = weightedAverage(
    rows.map((r) => ({ value: avgOf(r.id), absent: false, scale: 20, coef: 1 }))
  );

  return (
    <div>
      <div className="notes-bar">
        <div className="class-picker">
          {classes.map((c) => (
            <button key={c.id} className={c.id === classId ? "on" : ""} onClick={() => setClassId(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <span className="grow" />
        {classId && <button onClick={() => setAdding(!adding)}>{adding ? "Fermer" : "+ Nouveau devoir"}</button>}
      </div>
      {error && <p className="error">{error}</p>}
      {adding && classId && (
        <NewAssessment
          classId={classId}
          onCreated={async () => {
            setAdding(false);
            await load();
          }}
        />
      )}
      {loading ? (
        <p className="muted">Chargement…</p>
      ) : !classId ? (
        <p className="muted empty">Crée d&apos;abord une classe.</p>
      ) : rows.length === 0 ? (
        <p className="muted empty">Aucun élève dans cette classe.</p>
      ) : assessments.length === 0 ? (
        <p className="muted empty">Aucun devoir. Clique sur « + Nouveau devoir » pour saisir des notes.</p>
      ) : (
        <div className="table-wrap">
          <table className="appel-table notes-table">
            <thead>
              <tr>
                <th className="left">Élève</th>
                {assessments.map((a) => (
                  <th key={a.id} className="note-head">
                    <div className="nh-title">{a.title}</div>
                    <div className="nh-meta">{formatShortDay(a.date)} · /{a.scale} · coef {a.coef}</div>
                    <div className="nh-actions">
                      <button className="mini" onClick={() => togglePublished(a)} title="Visible par les élèves">
                        {a.published ? "👁 Publié" : "🚫 Non publié"}
                      </button>
                      <button className="mini" onClick={() => removeAssessment(a)} aria-label="Supprimer le devoir">✕</button>
                    </div>
                  </th>
                ))}
                <th className="avg-col">Moyenne</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="left who-name">{r.name}</td>
                  {assessments.map((a) => {
                    const g = grades.get(gkey(a.id, r.id));
                    return (
                      <td key={a.id} className="note-cell">
                        <input
                          key={`${g?.value}-${g?.absent}`}
                          type="text"
                          inputMode="decimal"
                          aria-label={`${r.name} — ${a.title}`}
                          defaultValue={g?.absent ? "abs" : g?.value != null ? String(g.value).replace(".", ",") : ""}
                          onBlur={(e) => saveGrade(a, r.id, e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        />
                      </td>
                    );
                  })}
                  <td className="avg-col"><strong>{fmtNote(avgOf(r.id))}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="left"><strong>Moyenne de la classe</strong></td>
                {assessments.map((a) => (
                  <td key={a.id}>{fmtNote(classAvgOf(a))}</td>
                ))}
                <td className="avg-col"><strong>{fmtNote(generalAvg)}</strong></td>
              </tr>
            </tfoot>
          </table>
          <p className="muted small">Saisis la note puis Entrée (virgule acceptée) ; « abs » pour un élève absent. Les moyennes sont ramenées sur 20.</p>
        </div>
      )}
    </div>
  );
}

function NewAssessment({ classId, onCreated }: { classId: string; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [scale, setScale] = useState(20);
  const [coef, setCoef] = useState(1);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await getEs()
      .from("es_assessments")
      .insert({ class_id: classId, title: title.trim(), date, scale, coef, published });
    setBusy(false);
    if (error) setError(error.message);
    else onCreated();
  }

  return (
    <form className="card composer" onSubmit={submit}>
      <div className="row">
        <label>
          Intitulé
          <input type="text" required value={title} placeholder="Ex. : Contrôle — le passé composé" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Date
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Barème
          <input type="number" min={1} max={100} value={scale} onChange={(e) => setScale(Number(e.target.value) || 20)} />
        </label>
        <label>
          Coefficient
          <input type="number" min={0} max={20} step={0.5} value={coef} onChange={(e) => setCoef(Number(e.target.value))} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row end">
        <label className="check">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Publier aux élèves
        </label>
        <button className="primary" disabled={busy}>{busy ? "…" : "Créer le devoir"}</button>
      </div>
    </form>
  );
}
