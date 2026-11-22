"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  REMARK_LABEL,
  formatDateTime,
  formatDay,
  getEs,
  hhmm,
  type AppelTarget,
  type AttStatus,
  type Attendance,
  type Profile,
  type Remark,
  type RemarkKind,
  type Session,
} from "@/lib/espagnol";

export const slotTime = (s: { start_time: string; end_time: string }) => `${hhmm(s.start_time)}–${hhmm(s.end_time)}`;

type FlagKey = "infirmary" | "excluded" | "exempt";

// Types d'observations saisis avec un texte (les deux autres se cochent directement)
const TEXT_KINDS: RemarkKind[] = ["encouragement", "observation", "behaviour", "punishment"];
const CHECK_KINDS: RemarkKind[] = ["material", "homework"];

// Liste d'appel façon Pronote : une ligne par élève, des cases à cocher par colonne
export default function AppelSheet({
  target,
  profiles,
  onSaved,
}: {
  target: AppelTarget;
  profiles: Map<string, Profile>;
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
  const [dialog, setDialog] = useState<{ studentId: string; kind: RemarkKind } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const m = await es.from("es_members").select("student_id").eq("class_id", cls.id);
    const s = await es
      .from("es_sessions")
      .select("*")
      .eq("class_id", cls.id)
      .eq("date", date)
      .eq("start_time", `${start}:00`)
      .maybeSingle();
    if (m.error || s.error) {
      setError((m.error ?? s.error)!.message);
      setLoading(false);
      return;
    }
    const sess = (s.data as Session | null) ?? null;
    setMembers((m.data ?? []).map((x: { student_id: string }) => x.student_id));
    setSession(sess);
    setTopic(sess?.topic ?? "");
    if (sess) {
      const [a, r, p] = await Promise.all([
        es.from("es_attendance").select("*").eq("session_id", sess.id),
        es.from("es_remarks").select("*").eq("session_id", sess.id).order("created_at"),
        es.from("es_participation").select("student_id,rating").eq("session_id", sess.id),
      ]);
      if (a.error || r.error || p.error) setError((a.error ?? r.error ?? p.error)!.message);
      else {
        setAtt(new Map(((a.data ?? []) as Attendance[]).map((x): [string, Attendance] => [x.student_id, x])));
        setRemarks((r.data ?? []) as Remark[]);
        setPart(new Map(((p.data ?? []) as { student_id: string; rating: number }[]).map((x): [string, number] => [x.student_id, x.rating])));
      }
    } else {
      setAtt(new Map());
      setRemarks([]);
      setPart(new Map());
    }
    setLoading(false);
  }, [es, cls.id, date, start]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setDialog(null);
    load();
  }, [load]);

  // L'appel n'est créé en base qu'à la première saisie
  async function ensureSession(): Promise<Session | null> {
    if (session) return session;
    const ins = await es
      .from("es_sessions")
      .insert({ class_id: cls.id, date, start_time: start, end_time: end, room, slot_id: slotId, topic })
      .select()
      .single();
    if (ins.error || !ins.data) {
      const again = await es
        .from("es_sessions")
        .select("*")
        .eq("class_id", cls.id)
        .eq("date", date)
        .eq("start_time", `${start}:00`)
        .maybeSingle();
      if (again.data) {
        setSession(again.data as Session);
        return again.data as Session;
      }
      setError(ins.error?.message ?? "Impossible d'ouvrir l'appel.");
      return null;
    }
    setSession(ins.data as Session);
    return ins.data as Session;
  }

  // Écrit la ligne d'un élève ; supprimée quand il n'y a plus rien à signaler (= présent)
  async function writeRow(studentId: string, next: Attendance | null) {
    const sess = await ensureSession();
    if (!sess) return;
    const empty = !next || (next.status === "present" && !next.infirmary && !next.excluded && !next.exempt);
    setAtt((cur) => {
      const m = new Map(cur);
      if (empty) m.delete(studentId);
      else m.set(studentId, { ...next!, session_id: sess.id });
      return m;
    });
    const { error } = empty
      ? await es.from("es_attendance").delete().eq("session_id", sess.id).eq("student_id", studentId)
      : await es
          .from("es_attendance")
          .upsert({ ...next!, session_id: sess.id, updated_at: new Date().toISOString() }, { onConflict: "session_id,student_id" });
    if (error) {
      setError(error.message);
      load();
    } else onSaved();
  }

  const rowOf = (id: string): Attendance =>
    att.get(id) ?? {
      session_id: session?.id ?? "",
      student_id: id,
      status: "present",
      late_minutes: null,
      excused: false,
      reason: "",
      infirmary: false,
      excluded: false,
      exempt: false,
    };

  function setStatus(id: string, status: AttStatus, checked: boolean) {
    const cur = rowOf(id);
    const nextStatus: AttStatus = checked ? status : "present";
    const next: Attendance = {
      ...cur,
      status: nextStatus,
      late_minutes: nextStatus === "late" ? (cur.late_minutes ?? 5) : null,
      excused: nextStatus === "present" ? false : cur.excused,
      reason: nextStatus === "present" ? "" : cur.reason,
    };
    if (nextStatus === "absent" && part.has(id)) clearRating(id);
    writeRow(id, next);
  }

  function setFlag(id: string, key: FlagKey, checked: boolean) {
    writeRow(id, { ...rowOf(id), [key]: checked });
  }

  async function clearRating(id: string) {
    setPart((cur) => {
      const m = new Map(cur);
      m.delete(id);
      return m;
    });
    if (session) await es.from("es_participation").delete().eq("session_id", session.id).eq("student_id", id);
  }

  async function rate(id: string, rating: number) {
    const sess = await ensureSession();
    if (!sess) return;
    const same = part.get(id) === rating;
    setPart((cur) => {
      const m = new Map(cur);
      if (same) m.delete(id);
      else m.set(id, rating);
      return m;
    });
    const { error } = same
      ? await es.from("es_participation").delete().eq("session_id", sess.id).eq("student_id", id)
      : await es
          .from("es_participation")
          .upsert(
            { session_id: sess.id, student_id: id, rating, updated_at: new Date().toISOString() },
            { onConflict: "session_id,student_id" }
          );
    if (error) {
      setError(error.message);
      load();
    } else onSaved();
  }

  async function addTextRemark(id: string, kind: RemarkKind, body: string, visible: boolean): Promise<void> {
    const sess = await ensureSession();
    if (!sess) return;
    const { error } = await es.from("es_remarks").insert({
      class_id: cls.id,
      session_id: sess.id,
      student_id: id,
      kind,
      body: body.trim(),
      visible_to_student: visible,
    });
    if (error) setError(error.message);
    else {
      await load();
      onSaved();
    }
  }

  async function deleteRemark(id: string) {
    const { error } = await es.from("es_remarks").delete().eq("id", id);
    if (error) setError(error.message);
    else {
      setRemarks((cur) => cur.filter((r) => r.id !== id));
      onSaved();
    }
  }

  async function saveTopic() {
    if (topic === (session?.topic ?? "")) return;
    if (!session && !topic.trim()) return;
    const sess = await ensureSession();
    if (!sess) return;
    const { error } = await es.from("es_sessions").update({ topic }).eq("id", sess.id);
    if (error) setError(error.message);
    else setSession({ ...sess, topic });
  }

  async function validate() {
    const sess = await ensureSession();
    if (!sess) return;
    const { data, error } = await es
      .from("es_sessions")
      .update({ validated_at: new Date().toISOString(), topic })
      .eq("id", sess.id)
      .select()
      .single();
    if (error) setError(error.message);
    else {
      setSession(data as Session);
      onSaved();
    }
  }

  const rows = members
    .map((id) => ({ id, name: profiles.get(id)?.full_name || "(sans nom)" }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const absents = rows.filter((r) => att.get(r.id)?.status === "absent").length;
  const lates = rows.filter((r) => att.get(r.id)?.status === "late").length;

  return (
    <div className="appel-sheet">
      <div className="appel-title">
        <div>
          <h2>
            {cls.name}
          </h2>
          <p className="muted small">
            {formatDay(date)} · {start}–{end}
            {room ? ` · salle ${room}` : ""}
          </p>
        </div>
        <div className="appel-valid">
          {session?.validated_at ? (
            <span className="ok small">✓ Appel validé le {formatDateTime(session.validated_at)}</span>
          ) : (
            <span className="muted small">Appel non validé</span>
          )}
          <button className="primary" onClick={validate} disabled={loading}>
            {session?.validated_at ? "Valider à nouveau" : "Valider l'appel"}
          </button>
        </div>
      </div>

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
          <p className="small appel-count">
            {rows.length} élève{rows.length > 1 ? "s" : ""} · <strong>{absents}</strong> absent{absents > 1 ? "s" : ""} ·{" "}
            <strong>{lates}</strong> en retard — les élèves non cochés sont présents.
          </p>

          {rows.length === 0 ? (
            <p className="muted empty">Aucun élève dans cette classe. Ajoute-les dans « Cahier de textes » → Classes et élèves.</p>
          ) : (
            <div className="table-wrap">
              <table className="appel-table tap-table">
                <thead>
                  <tr>
                    <th className="left">Élève</th>
                    <th>Absent</th>
                    <th>Retard</th>
                    <th>Infirmerie</th>
                    <th>Exclu</th>
                    <th>Dispensé</th>
                    <th>Oubli matériel</th>
                    <th>Travail non fait</th>
                    <th>Encour.</th>
                    <th>Observ.</th>
                    <th>Punition</th>
                    <th>Particip.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const a = rowOf(r.id);
                    const mine = remarks.filter((x) => x.student_id === r.id);
                    const countOf = (k: RemarkKind) => mine.filter((x) => x.kind === k).length;
                    return (
                      <Fragment key={r.id}>
                        <tr className={`st-${a.status}`}>
                          <td className="left who-name">{r.name}</td>
                          <td
                            className={`tap${a.status === "absent" ? " on abs" : ""}`}
                            onClick={() => setStatus(r.id, "absent", a.status !== "absent")}
                            role="button"
                            aria-pressed={a.status === "absent"}
                            aria-label={`${r.name} absent`}
                          >
                            {a.status === "absent" ? "Absent" : ""}
                          </td>
                          <td
                            className={`tap${a.status === "late" ? " on late" : ""}`}
                            onClick={() => setStatus(r.id, "late", a.status !== "late")}
                            role="button"
                            aria-pressed={a.status === "late"}
                            aria-label={`${r.name} en retard`}
                          >
                            {a.status === "late" ? `${a.late_minutes ?? 5} min` : ""}
                          </td>
                          {(["infirmary", "excluded", "exempt"] as FlagKey[]).map((k) => (
                            <td
                              key={k}
                              className={`tap${a[k] ? " on flag" : ""}`}
                              onClick={() => setFlag(r.id, k, !a[k])}
                              role="button"
                              aria-pressed={a[k]}
                              aria-label={`${r.name} ${k}`}
                            >
                              {a[k] ? "✔" : ""}
                            </td>
                          ))}
                          {(["material", "homework", "encouragement", "observation", "punishment"] as RemarkKind[]).map((k) => (
                            <td
                              key={k}
                              className={`tap${countOf(k) > 0 ? " on rem" : ""}`}
                              onClick={() => setDialog({ studentId: r.id, kind: k })}
                              role="button"
                              aria-label={`${REMARK_LABEL[k]} pour ${r.name}`}
                            >
                              {countOf(k) > 0 ? countOf(k) : ""}
                            </td>
                          ))}
                          <td>
                            {a.status === "absent" ? (
                              <span className="muted">—</span>
                            ) : (
                              <span className="stars" role="group" aria-label={`Participation de ${r.name}`}>
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    className={`star${(part.get(r.id) ?? 0) >= n ? " on" : ""}`}
                                    onClick={() => rate(r.id, n)}
                                    aria-label={`${n} sur 5`}
                                  >
                                    ★
                                  </button>
                                ))}
                              </span>
                            )}
                          </td>
                        </tr>
                        {a.status !== "present" && (
                          <tr className="detail">
                            <td colSpan={12}>
                              <div className="appel-detail">
                                {a.status === "late" && (
                                  <label className="inline">
                                    Retard de
                                    <input
                                      type="number"
                                      min={1}
                                      max={600}
                                      value={a.late_minutes ?? 5}
                                      onChange={(e) =>
                                        writeRow(r.id, { ...a, late_minutes: Math.max(1, Number(e.target.value) || 1) })
                                      }
                                    />
                                    min
                                  </label>
                                )}
                                <button
                                  type="button"
                                  className={`chip${a.excused ? " on" : ""}`}
                                  onClick={() => writeRow(r.id, { ...a, excused: !a.excused })}
                                >
                                  {a.excused ? "Justifié" : "Non justifié"}
                                </button>
                                <input
                                  type="text"
                                  placeholder="Motif (facultatif)"
                                  defaultValue={a.reason}
                                  onBlur={(e) => e.target.value !== a.reason && writeRow(r.id, { ...a, reason: e.target.value })}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small">Touche une case pour la cocher ou la décocher. Pour les oublis, travaux non faits et observations, une fenêtre s&apos;ouvre pour écrire.</p>
        </>
      )}
      {dialog && (
        <RemarkDialog
          title={`${REMARK_LABEL[dialog.kind]} — ${rows.find((x) => x.id === dialog.studentId)?.name ?? ""}`}
          kind={dialog.kind}
          existing={remarks.filter((x) => x.student_id === dialog.studentId && x.kind === dialog.kind)}
          onAdd={async (body, visible) => {
            await addTextRemark(dialog.studentId, dialog.kind, body || REMARK_LABEL[dialog.kind], visible);
          }}
          onDelete={deleteRemark}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// Boîte de dialogue : saisie libre d'un oubli, travail non fait, observation…
function RemarkDialog({
  title,
  kind,
  existing,
  onAdd,
  onDelete,
  onClose,
}: {
  title: string;
  kind: RemarkKind;
  existing: Remark[];
  onAdd: (body: string, visible: boolean) => Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onAdd(body.trim(), visible);
    setBusy(false);
    setBody("");
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-label={title}>
        <h3>{title}</h3>
        {existing.length > 0 && (
          <ul className="plain">
            {existing.map((x) => (
              <li key={x.id} className="small">
                {x.body}
                {!x.visible_to_student && <span className="muted"> (privé)</span>}{" "}
                <button type="button" className="link" onClick={() => onDelete(x.id)}>Supprimer</button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          autoFocus
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={kind === "material" || kind === "homework" ? "Précision (facultatif)…" : "Écris ici…"}
        />
        <label className="check small">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          Visible par l&apos;élève
        </label>
        <div className="row end">
          <button type="button" onClick={onClose}>Fermer</button>
          <button className="primary" disabled={busy || (!body.trim() && kind !== "material" && kind !== "homework")}>Ajouter</button>
        </div>
      </form>
    </div>
  );
}

export function RemarkForm({
  onAdd,
  onCancel,
  initialKind = "observation",
}: {
  onAdd: (kind: RemarkKind, body: string, visible: boolean) => Promise<void>;
  onCancel?: () => void;
  initialKind?: RemarkKind;
}) {
  const [kind, setKind] = useState<RemarkKind>(initialKind);
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
        {(Object.keys(REMARK_LABEL) as RemarkKind[])
          .filter((k) => !CHECK_KINDS.includes(k) || k === initialKind)
          .map((k) => (
            <option key={k} value={k}>{REMARK_LABEL[k]}</option>
          ))}
      </select>
      <input type="text" required autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="Texte…" />
      <label className="check small">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        Visible par l&apos;élève
      </label>
      <button className="primary" disabled={busy}>Ajouter</button>
      {onCancel && <button type="button" onClick={onCancel}>Annuler</button>}
    </form>
  );
}

export { TEXT_KINDS };
