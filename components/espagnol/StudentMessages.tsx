"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime, getEs, MESSAGE_SELECT, sendMessage, type Message } from "@/lib/espagnol";
import Attachments from "./Attachments";
import { AttachButton, PickedList } from "./PickFiles";

// Informations de la classe et messagerie avec le professeur
export function StudentMessages({ userId, classId }: { userId: string; classId: string }) {
  const es = getEs();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await es.from("es_messages").select(MESSAGE_SELECT).eq("class_id", classId).order("created_at");
    if (error) setError(error.message);
    else setMessages((data ?? []) as Message[]);
  }, [es, classId]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 20000);
    return () => window.clearInterval(t);
  }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && picked.length === 0) return;
    setBusy(true);
    setError(null);
    const err = await sendMessage({ class_id: classId, student_id: userId, sender_id: userId, body: text }, picked);
    setBusy(false);
    if (err) setError(err);
    setText("");
    setPicked([]);
    await load();
  }

  const infos = messages.filter((m) => m.student_id === null).slice().reverse();
  const mine = messages.filter((m) => m.student_id === userId);

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <h3 className="sect">Informations</h3>
      {infos.length === 0 ? (
        <p className="muted empty">Aucune information.</p>
      ) : (
        infos.map((m) => (
          <article key={m.id} className="card post">
            <header>
              <span className="badge announcement">Information</span>
              <span className="muted small date">{formatDateTime(m.created_at)}</span>
            </header>
            {m.body && <p className="body">{m.body}</p>}
            <Attachments files={m.es_message_files ?? []} />
          </article>
        ))
      )}
      <h3 className="sect">Messages avec mon professeur</h3>
      <div className="card thread">
        <div className="bubbles">
          {mine.length === 0 && <p className="muted small">Aucun message.</p>}
          {mine.map((m) => (
            <div key={m.id} className={`bubble ${m.sender_id === userId ? "me" : "them"}`}>
              {m.body && <p>{m.body}</p>}
              <Attachments files={m.es_message_files ?? []} />
              <span className="muted small">{formatDateTime(m.created_at)}</span>
            </div>
          ))}
        </div>
        <PickedList files={picked} onRemove={(i) => setPicked((c) => c.filter((_, j) => j !== i))} />
        <form className="inline-form" onSubmit={send}>
          <AttachButton onPick={(f) => setPicked((c) => [...c, ...f])} />
          <input type="text" value={text} placeholder="Écrire à mon professeur…" onChange={(e) => setText(e.target.value)} />
          <button className="primary" disabled={busy || (!text.trim() && picked.length === 0)}>Envoyer</button>
        </form>
      </div>
    </div>
  );
}
