"use client";

import { useCallback, useEffect, useState } from "react";
import {
  REMARK_LABEL,
  STATUS_LABEL,
  formatDay,
  getEs,
  hhmm,
  type AttStatus,
  type Attendance,
  type ClassRow,
  type Profile,
  type Remark,
  type RemarkKind,
  type Session,
} from "@/lib/espagnol";

export type AppelTarget = {
  cls: ClassRow;
  date: string;
  start: string; // « HH:MM »
  end: string;
  room: string;
  slotId: string | null;
};

// Liste d'appel d'un cours : présent / absent / retard, justification, observations
export default function Appel({
  target,
  profiles,
  onClose,
  onSaved,
}: {
  target: AppelTarget;
  profiles: Map<string, Profile>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const es = getEs();
  const { cls, date, start, end, room, slotId } = target;
  const [session, setSession] = useState<Session | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [att, setAtt] = useState<Map<string, Attendance>>(new Map());
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [part, setPart] = useState<Map<string, number>>(new Map());
  const [topic, setTopic] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const startDb = `${start}:00`;
    let s = (
      await es.from("es_sessions").select("*").eq("class_id", cls.id).eq("date", date).eq("start_time", startDb).maybeSingle()
    ).data as Session | null;
    if (!s) {
      const ins = await es
        .from("es_sessions")
        .insert({ class_id: cls.id, date, start_time: start, end_time: end, room, slot_id: slotId })
        .select()
        .single();
      if (ins.error || !ins.data) {
        setError(ins.error?.message ?? "Impossible d'ouvrir l'appel.");
        setLoading(false);
        return;
      }
      s = ins.data as Session;
    }
    const [m, a, r, p] = await Promise.all([
      es.from("es_members").select("student_id").eq("class_id", cls.id),
      es.from("es_attendance").select("*").eq("session_id", s.id),
      es.from("es_remarks").select("*").eq("session_id", s.id).order("created_at"),
      es.from("es_participation").select("student_id,rating").eq("session_id", s.id),
    ]);
    if (m.error || a.error || r.error || p.error) setError((m.error ?? a.error ?? r.error ?? p.error)!.message);
    else {
      setSession(s);
      setTopic(s.topic);
      setMembers((m.data ?? []).map((x: { student_id: string }) => x.student_id));
      setAtt(new Map(((a.data ?? []) as Attendance[]).map((x): [string, Attendance] => [x.student_id, x])));
      setRemarks((r.data ?? []) as Remark[]);
      setPart(new Map(((p.data ?? []) as { student_id: string; rating: number }[]).map((x): [string, number] => [x.student_id, x.rating])));
    }
    setLoading(false);
  }, [es, cls.id, date, start, end, room, slotId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(studentId: string, patch: Partial<Attendance> & { status: AttStatus }) {
    if (!session) return;
    const prev = att.get(studentId);
    const row: Attendance = {
      session_id: session.id,
      student_id: studentId,
      status: patch.status,
      late_minutes: patch.status === "late" ? (patch.late_minutes ?? prev?.late_minutes ?? 5) : null,
      excused: patch.status === "present" ? false : (patch.excused ?? prev?.excused ?? false),
      reason: patch.status === "present" ? "" : (patch.reason ?? prev?.reason ?? ""),
    };
    setAtt((cur) => new Map(cur).set(studentId, row));
    if (patch.status === "absent" && part.has(studentId)) {
      // un élève absent n'a pas de note de participation
      setPart((cur) => {
        const next = new Map(cur);
        next.delete(studentId);
        return next;
      });
      await es.from("es_participation").delete().eq("session_id", session.id).eq("student_id", studentId);
    }
    const { error } = await es
      .from("es_attendance")
      .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "session_id,student_id" });
    if (error) {
      setError(error.message);
      load();
    } else onSaved();
  }

  async function allPresent() {
    if (!session) return;
    const missing = members.filter((id) => !att.has(id));
    if (missing.length === 0) return;
    const rows = missing.map((id) => ({
      session_id: session.id,
      student_id: id,
      status: "present" as AttStatus,
      late_minutes: null,
      excused: false,
      reason: "",
    }));
    const { error } = await es.from("es_attendance").upsert(rows, { onConflict: "session_id,student_id" });
    if (error) setError(error.message);
    await load();
    onSaved();
  }

  async function rate(studentId: string, rating: number) {
    if (!session) return;
    const same = part.get(studentId) === rating;
    setPart((cur) => {
      const next = new Map(cur);
      if (same) next.delete(studentId);
      else next.set(studentId, rating);
      return next;
    });
    const { error } = same
      ? await es.from("es_participation").delete().eq("session_id", session.id).eq("student_id", studentId)
      : await es
          .from("es_participation")
          .upsert(
            { session_id: session.id, student_id: studentId, rating, updated_at: new Date().toISOString() },
            { onConflict: "session_id,student_id" }
          );
    if (error) {
      setError(error.message);
      load();
    } else onSaved();
  }

  async function saveTopic() {
    if (!session || topic === session.topic) return;
    const { error } = await es.from("es_sessions").update({ topic }).eq("id", session.id);
    if (error) setError(error.message);
    else setSession({ ...session, topic });
  }

  async function addRemark(studentId: string, kind: RemarkKind, body: string, visible: boolean) {
    if (!session) return false;
    const { error } = await es.from("es_remarks").insert({
      class_id: cls.id,
      session_id: session.id,
      student_id: studentId,
      kind,
      body: body.trim(),
      visible_to_student: visible,
    });
    if (error) {
      setError(error.message);
      return false;
    }
    await load();
    onSaved();
    return true;
  }

  async function deleteRemark(id: string) {
    const { error } = await es.from("es_remarks").delete().eq("id", id);
    if (error) setError(error.message);
    else {
      setRemarks((cur) => cur.filter((r) => r.id !== id));
      onSaved();
    }
  }

  const rows = members
    .map((id) => ({ id, name: profiles.get(id)?.full_name || "(sans nom)" }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const count = (s: AttStatus) => rows.filter((r) => att.get(r.id)?.status === s).length;
  const unset = rows.filter((r) => !att.has(r.id)).length;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal appel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Appel">
        <header>
          <div>
            <strong>
              Appel · {cls.name}
            </strong>
            <div className="muted small">
              {formatDay(date)} · {start}–{end}
              {room ? ` · salle ${room}` : ""}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer">✕</button>
        </header>
        <div className="appel-body">
          {error && <p className="error">{error}</p>}
          {loading ? (
            <p className="muted">Chargement…</p>
          ) : (
            <>
              <label className="topic">
                Contenu du cours
                <input
                  type="text"
                  value={topic}
                  placeholder="Ex. : le passé composé, exercices p. 42"
                  onChange={(e) => setTopic(e.target.value)}
                  onBlur={saveTopic}
                />
              </label>
              <div className="appel-bar">
                <span className="small">
                  <strong>{count("present")}</strong> présents · <strong>{count("absent")}</strong> absents ·{" "}
                  <strong>{count("late")}</strong> en retard · {unset} non renseigné{unset > 1 ? "s" : ""}
                </span>
                <button onClick={allPresent} disabled={unset === 0}>Tous présents</button>
              </div>
              {rows.length === 0 ? (
                <p className="muted empty">Aucun élève dans cette classe. Ajoute-les dans l&apos;onglet « Élèves ».</p>
              ) : (
                <ul className="appel-list">
                  {rows.map((r) => {
                    const a = att.get(r.id);
                    const mine = remarks.filter((x) => x.student_id === r.id);
                    return (
                      <li key={r.id} className={a ? `st-${a.status}` : ""}>
                        <div className="appel-row">
                          <span className="who-name">{r.name}</span>
                          <span className="seg">
                            {(["present", "absent", "late"] as AttStatus[]).map((s) => (
                              <button
                                key={s}
                                className={a?.status === s ? `on ${s}` : ""}
                                onClick={() => save(r.id, { status: s })}
                              >
                                {STATUS_LABEL[s]}
                              </button>
                            ))}
                          </span>
                          <button className="mini" onClick={() => setOpen(open === r.id ? null : r.id)}>
                            💬 {mine.length > 0 ? mine.length : "+"}
                          </button>
                        </div>
                        {a && a.status !== "absent" && (
                          <div className="stars" role="group" aria-label={`Participation de ${r.name}`}>
                            <span className="muted small">Participation</span>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                className={`star${(part.get(r.id) ?? 0) >= n ? " on" : ""}`}
                                onClick={() => rate(r.id, n)}
                                aria-label={`${n} sur 5`}
                                aria-pressed={part.get(r.id) === n}
                              >
                                ★
                              </button>
                            ))}
                            {part.has(r.id) && <span className="muted small">{part.get(r.id)}/5</span>}
                          </div>
                        )}
                        {a && a.status !== "present" && (
                          <div className="appel-detail">
                            {a.status === "late" && (
                              <label className="inline">
                                Retard
                                <input
                                  type="number"
                                  min={1}
                                  max={600}
                                  value={a.late_minutes ?? 5}
                                  onChange={(e) =>
                                    save(r.id, { status: "late", late_minutes: Math.max(1, Number(e.target.value) || 1) })
                                  }
                                />
                                min
                              </label>
                            )}
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={a.excused}
                                onChange={(e) => save(r.id, { status: a.status, excused: e.target.checked })}
                              />
                              Justifié
                            </label>
                            <input
                              type="text"
                              placeholder="Motif (facultatif)"
                              defaultValue={a.reason}
                              onBlur={(e) => e.target.value !== a.reason && save(r.id, { status: a.status, reason: e.target.value })}
                            />
                          </div>
                        )}
                        {mine.map((x) => (
                          <p key={x.id} className="remark small">
                            <span className={`badge remark-${x.kind}`}>{REMARK_LABEL[x.kind]}</span> {x.body}
                            {!x.visible_to_student && <span className="muted"> (privé)</span>}{" "}
                            <button className="link" onClick={() => deleteRemark(x.id)}>Supprimer</button>
                          </p>
                        ))}
                        {open === r.id && (
                          <RemarkForm
                            onAdd={async (kind, body, visible) => {
                              const ok = await addRemark(r.id, kind, body, visible);
                              if (ok) setOpen(null);
                            }}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function RemarkForm({
  onAdd,
  onCancel,
}: {
  onAdd: (kind: RemarkKind, body: string, visible: boolean) => Promise<void>;
  onCancel?: () => void;
}) {
  const [kind, setKind] = useState<RemarkKind>("observation");
  const [body, setBody] = useState("");
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    await onAdd(kind, body, visible);
    setBusy(false);
    setBody("");
  }

  return (
    <form className="remark-form" onSubmit={submit}>
      <select value={kind} onChange={(e) => setKind(e.target.value as RemarkKind)} aria-label="Type d'observation">
        {(Object.keys(REMARK_LABEL) as RemarkKind[]).map((k) => (
          <option key={k} value={k}>{REMARK_LABEL[k]}</option>
        ))}
      </select>
      <input type="text" required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Observation…" />
      <label className="check small">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        Visible par l&apos;élève
      </label>
      <button className="primary" disabled={busy}>Ajouter</button>
      {onCancel && <button type="button" onClick={onCancel}>Annuler</button>}
    </form>
  );
}

// Aide pour afficher l'heure d'un créneau
export const slotTime = (s: { start_time: string; end_time: string }) => `${hhmm(s.start_time)}–${hhmm(s.end_time)}`;
