"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime, getEs, type ClassRow, type Message, type Profile } from "@/lib/espagnol";

// Communication : informations à toute la classe + messagerie avec chaque élève
export default function Communication({ sub, classes, profiles }: { sub: "info" | "mail"; classes: ClassRow[]; profiles: Map<string, Profile> }) {
  const es = getEs();
  const [classId, setClassId] = useState<string | null>(classes[0]?.id ?? null);
  const [members, setMembers] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [student, setStudent] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classId) return;
    const [m, x] = await Promise.all([
      es.from("es_members").select("student_id").eq("class_id", classId),
      es.from("es_messages").select("*").eq("class_id", classId).order("created_at"),
    ]);
    if (m.error || x.error) return setError((m.error ?? x.error)!.message);
    setMembers((m.data ?? []).map((r: { student_id: string }) => r.student_id));
    setMessages((x.data ?? []) as Message[]);
  }, [es, classId]);

  useEffect(() => {
    setStudent(null);
    setError(null);
    load();
    const t = window.setInterval(load, 20000);
    return () => window.clearInterval(t);
  }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!classId || !text.trim()) return;
    if (sub === "mail" && !student) return;
    setBusy(true);
    const { error } = await es
      .from("es_messages")
      .insert({ class_id: classId, student_id: sub === "mail" ? student : null, body: text.trim() });
    setBusy(false);
    if (error) setError(error.message);
    else {
      setText("");
      await load();
    }
  }

  async function remove(id: string) {
    const { error } = await es.from("es_messages").delete().eq("id", id);
    if (error) setError(error.message);
    else setMessages((cur) => cur.filter((m) => m.id !== id));
  }

  const name = (id: string) => profiles.get(id)?.full_name || "Élève";
  const students = members.slice().sort((a, b) => name(a).localeCompare(name(b), "fr"));
  const infos = messages.filter((m) => m.student_id === null).slice().reverse();
  const thread = messages.filter((m) => m.student_id === student);
  const unread = (id: string) => {
    const mine = messages.filter((m) => m.student_id === id);
    return mine.length > 0 && mine[mine.length - 1].sender_id === id;
  };

  return (
    <div>
      <div className="class-picker">
        {classes.map((c) => (
          <button key={c.id} className={c.id === classId ? "on" : ""} onClick={() => setClassId(c.id)}>{c.name}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {!classId ? (
        <p className="muted empty">Crée d&apos;abord une classe.</p>
      ) : sub === "info" ? (
        <div>
          <form className="card composer" onSubmit={send}>
            <label>
              Information à toute la classe
              <textarea rows={3} value={text} placeholder="Ex. : Le contrôle de jeudi est reporté à lundi." onChange={(e) => setText(e.target.value)} />
            </label>
            <div className="row end">
              <button className="primary" disabled={busy || !text.trim()}>Envoyer à la classe</button>
            </div>
          </form>
          {infos.length === 0 ? (
            <p className="muted empty">Aucune information envoyée.</p>
          ) : (
            infos.map((m) => (
              <article key={m.id} className="card post">
                <header>
                  <span className="badge announcement">Information</span>
                  <span className="muted small date">{formatDateTime(m.created_at)}</span>
                </header>
                <p className="body">{m.body}</p>
                <div className="post-actions">
                  <button className="danger" onClick={() => remove(m.id)}>Supprimer</button>
                </div>
              </article>
            ))
          )}
        </div>
      ) : (
        <div className="pn-split mail">
          <aside className="pn-list">
            <h3>Élèves</h3>
            {students.length === 0 && <p className="muted small pad">Aucun élève.</p>}
            {students.map((id) => (
              <button key={id} className={id === student ? "on" : ""} onClick={() => setStudent(id)}>
                {name(id)} {unread(id) && <span className="dot" aria-label="Nouveau message" />}
              </button>
            ))}
          </aside>
          <div className="pn-main">
            {!student ? (
              <p className="muted empty">Choisis un élève pour voir ou écrire un message.</p>
            ) : (
              <div className="card thread">
                <h3>{name(student)}</h3>
                <div className="bubbles">
                  {thread.length === 0 && <p className="muted small">Aucun message.</p>}
                  {thread.map((m) => (
                    <div key={m.id} className={`bubble ${m.sender_id === student ? "them" : "me"}`}>
                      <p>{m.body}</p>
                      <span className="muted small">{formatDateTime(m.created_at)}</span>
                    </div>
                  ))}
                </div>
                <form className="inline-form" onSubmit={send}>
                  <input type="text" value={text} placeholder="Écrire un message…" onChange={(e) => setText(e.target.value)} />
                  <button className="primary" disabled={busy || !text.trim()}>Envoyer</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
