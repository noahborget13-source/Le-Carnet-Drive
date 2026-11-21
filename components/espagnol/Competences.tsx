"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LEVELS,
  getEs,
  type ClassRow,
  type Competency,
  type CompetencyMark,
  type Profile,
} from "@/lib/espagnol";

// Compétences façon Pronote : tableau élèves × compétences, niveaux de maîtrise à 4 degrés
export default function Competences({ classes, profiles }: { classes: ClassRow[]; profiles: Map<string, Profile> }) {
  const es = getEs();
  const [classId, setClassId] = useState<string | null>(classes[0]?.id ?? null);
  const [members, setMembers] = useState<string[]>([]);
  const [comps, setComps] = useState<Competency[]>([]);
  const [marks, setMarks] = useState<Map<string, CompetencyMark>>(new Map());
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mkey = (c: string, s: string) => `${c}|${s}`;

  const load = useCallback(async () => {
    if (!classId) {
      setLoading(false);
      return;
    }
    const [m, c] = await Promise.all([
      es.from("es_members").select("student_id").eq("class_id", classId),
      es.from("es_competencies").select("id,class_id,title").eq("class_id", classId).order("created_at"),
    ]);
    if (m.error || c.error) {
      setError((m.error ?? c.error)!.message);
      setLoading(false);
      return;
    }
    const list = (c.data ?? []) as Competency[];
    setMembers((m.data ?? []).map((x: { student_id: string }) => x.student_id));
    setComps(list);
    if (list.length) {
      const k = await es.from("es_competency_marks").select("*").in("competency_id", list.map((x) => x.id));
      if (k.error) setError(k.error.message);
      else setMarks(new Map(((k.data ?? []) as CompetencyMark[]).map((x): [string, CompetencyMark] => [mkey(x.competency_id, x.student_id), x])));
    } else setMarks(new Map());
    setLoading(false);
  }, [es, classId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    load();
  }, [load]);

  async function addCompetency(e: React.FormEvent) {
    e.preventDefault();
    if (!classId || !title.trim()) return;
    const { error } = await es.from("es_competencies").insert({ class_id: classId, title: title.trim() });
    if (error) setError(error.message);
    else {
      setTitle("");
      await load();
    }
  }

  async function removeCompetency(c: Competency) {
    if (!window.confirm(`Supprimer la compétence « ${c.title} » et tous ses niveaux ?`)) return;
    const { error } = await es.from("es_competencies").delete().eq("id", c.id);
    if (error) setError(error.message);
    else await load();
  }

  async function setLevel(c: Competency, studentId: string, value: string) {
    const key = mkey(c.id, studentId);
    if (value === "") {
      setMarks((cur) => {
        const m = new Map(cur);
        m.delete(key);
        return m;
      });
      const { error } = await es.from("es_competency_marks").delete().eq("competency_id", c.id).eq("student_id", studentId);
      if (error) setError(error.message);
      return;
    }
    const level = Number(value);
    setMarks((cur) => new Map(cur).set(key, { competency_id: c.id, student_id: studentId, level }));
    const { error } = await es
      .from("es_competency_marks")
      .upsert(
        { competency_id: c.id, student_id: studentId, level, updated_at: new Date().toISOString() },
        { onConflict: "competency_id,student_id" }
      );
    if (error) {
      setError(error.message);
      load();
    }
  }

  const rows = members
    .map((id) => ({ id, name: profiles.get(id)?.full_name || "(sans nom)" }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return (
    <div>
      <div className="notes-bar">
        <div className="class-picker">
          {classes.map((c) => (
            <button key={c.id} className={c.id === classId ? "on" : ""} onClick={() => setClassId(c.id)}>{c.name}</button>
          ))}
        </div>
      </div>
      <p className="small muted legend">
        {LEVELS.map((l) => (
          <span key={l.n} className={`lvl lvl-${l.n}`}>{l.short} = {l.label}</span>
        ))}
      </p>
      {error && <p className="error">{error}</p>}
      {classId && (
        <form className="inline-form" onSubmit={addCompetency}>
          <input type="text" value={title} placeholder="Nouvelle compétence (ex. : Comprendre un texte écrit)" onChange={(e) => setTitle(e.target.value)} />
          <button className="primary" disabled={!title.trim()}>Ajouter</button>
        </form>
      )}
      {loading ? (
        <p className="muted">Chargement…</p>
      ) : !classId ? (
        <p className="muted empty">Crée d&apos;abord une classe.</p>
      ) : comps.length === 0 ? (
        <p className="muted empty">Aucune compétence. Ajoute-en une ci-dessus.</p>
      ) : rows.length === 0 ? (
        <p className="muted empty">Aucun élève dans cette classe.</p>
      ) : (
        <div className="table-wrap">
          <table className="appel-table notes-table">
            <thead>
              <tr>
                <th className="left">Élève</th>
                {comps.map((c) => (
                  <th key={c.id} className="note-head">
                    <div className="nh-title">{c.title}</div>
                    <div className="nh-actions">
                      <button className="mini" onClick={() => removeCompetency(c)} aria-label="Supprimer la compétence">✕</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="left who-name">{r.name}</td>
                  {comps.map((c) => {
                    const lvl = marks.get(mkey(c.id, r.id))?.level;
                    return (
                      <td key={c.id} className={`note-cell${lvl ? ` lvl-${lvl}` : ""}`}>
                        <select value={lvl ?? ""} aria-label={`${r.name} — ${c.title}`} onChange={(e) => setLevel(c, r.id, e.target.value)}>
                          <option value="">—</option>
                          {LEVELS.map((l) => (
                            <option key={l.n} value={l.n}>{l.short}</option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
