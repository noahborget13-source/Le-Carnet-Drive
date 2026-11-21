"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DAYS,
  addDays,
  formatShortDay,
  getEs,
  hhmm,
  mondayOf,
  toYmd,
  type ClassRow,
  type Profile,
  type Session,
  type Slot,
} from "@/lib/espagnol";
import Appel, { slotTime, type AppelTarget } from "./Appel";

// Emploi du temps de la prof : créneaux hebdomadaires avec classe et salle, accès direct à l'appel
export default function Timetable({ classes, profiles }: { classes: ClassRow[]; profiles: Map<string, Profile> }) {
  const es = getEs();
  const [week, setWeek] = useState<Date>(() => mondayOf(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appel, setAppel] = useState<AppelTarget | null>(null);
  const [adding, setAdding] = useState(false);

  const weekStart = toYmd(week);
  const weekEnd = toYmd(addDays(week, 6));

  const load = useCallback(async () => {
    const [s, x] = await Promise.all([
      es.from("es_slots").select("*").order("start_time"),
      es.from("es_sessions").select("*").gte("date", weekStart).lte("date", weekEnd),
    ]);
    if (s.error) setError(s.error.message);
    else if (x.error) setError(x.error.message);
    else {
      setSlots((s.data ?? []) as Slot[]);
      setSessions((x.data ?? []) as Session[]);
    }
    setLoading(false);
  }, [es, weekStart, weekEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const classOf = useMemo(() => new Map(classes.map((c): [string, ClassRow] => [c.id, c])), [classes]);
  const today = toYmd(new Date());
  const lastDay = slots.some((s) => s.weekday >= 6) ? 7 : 5;
  const days = Array.from({ length: lastDay }, (_, i) => i + 1);

  async function removeSlot(s: Slot) {
    if (!window.confirm("Supprimer ce créneau de l'emploi du temps ? (les appels déjà faits sont conservés)")) return;
    const { error } = await es.from("es_slots").delete().eq("id", s.id);
    if (error) setError(error.message);
    else await load();
  }

  function openAppel(s: Slot, date: string) {
    const cls = classOf.get(s.class_id);
    if (!cls) return;
    setAppel({ cls, date, start: hhmm(s.start_time), end: hhmm(s.end_time), room: s.room, slotId: s.id });
  }

  return (
    <section>
      <div className="week-nav">
        <button onClick={() => setWeek(addDays(week, -7))} aria-label="Semaine précédente">←</button>
        <strong>
          Semaine du {formatShortDay(weekStart)} au {formatShortDay(toYmd(addDays(week, days.length - 1)))}
        </strong>
        <button onClick={() => setWeek(addDays(week, 7))} aria-label="Semaine suivante">→</button>
        <button onClick={() => setWeek(mondayOf(new Date()))}>Aujourd&apos;hui</button>
        <span className="grow" />
        <button onClick={() => setAdding(!adding)}>{adding ? "Fermer" : "+ Ajouter un créneau"}</button>
      </div>

      {error && <p className="error">{error}</p>}
      {adding && (
        <SlotForm
          classes={classes}
          onCreated={async () => {
            await load();
            setAdding(false);
          }}
        />
      )}
      {classes.length === 0 && (
        <p className="muted empty">Crée d&apos;abord une classe (onglet Classes) pour pouvoir remplir ton emploi du temps.</p>
      )}

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : (
        <div className="week" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((wd) => {
            const date = toYmd(addDays(week, wd - 1));
            const daySlots = slots.filter((s) => s.weekday === wd);
            return (
              <div key={wd} className={`day${date === today ? " today" : ""}`}>
                <h3>
                  {DAYS[wd - 1]} <span className="muted small">{formatShortDay(date).replace(/^\S+\s/, "")}</span>
                </h3>
                {daySlots.length === 0 && <p className="muted small">—</p>}
                {daySlots.map((s) => {
                  const cls = classOf.get(s.class_id);
                  const done = sessions.some((x) => x.class_id === s.class_id && x.date === date && hhmm(x.start_time) === hhmm(s.start_time));
                  return (
                    <div key={s.id} className={`slot${done ? " done" : ""}`}>
                      <div className="slot-time">{slotTime(s)}</div>
                      <div className="slot-class">{cls?.name ?? "Classe"}</div>
                      <div className="muted small">
                        {s.subject}
                        {s.room ? ` · salle ${s.room}` : ""}
                      </div>
                      <div className="slot-actions">
                        <button className={done ? "" : "primary"} onClick={() => openAppel(s, date)}>
                          {done ? "✓ Appel fait" : "Faire l'appel"}
                        </button>
                        <button className="mini danger" onClick={() => removeSlot(s)} aria-label="Supprimer le créneau">✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {appel && (
        <Appel
          target={appel}
          profiles={profiles}
          onClose={() => setAppel(null)}
          onSaved={load}
        />
      )}
    </section>
  );
}

function SlotForm({ classes, onCreated }: { classes: ClassRow[]; onCreated: () => void }) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [room, setRoom] = useState("");
  const [subject, setSubject] = useState("Espagnol");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (end <= start) return setError("L'heure de fin doit être après l'heure de début.");
    setBusy(true);
    const { error } = await getEs().from("es_slots").insert({
      class_id: classId,
      weekday,
      start_time: start,
      end_time: end,
      room: room.trim(),
      subject: subject.trim() || "Espagnol",
    });
    setBusy(false);
    if (error) setError(error.message);
    else onCreated();
  }

  return (
    <form className="card composer" onSubmit={submit}>
      <div className="row">
        <label>
          Classe
          <select value={classId} onChange={(e) => setClassId(e.target.value)} required>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          Jour
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {DAYS.slice(0, 6).map((d, i) => (
              <option key={d} value={i + 1}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Début
          <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          Fin
          <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <label>
          Salle
          <input type="text" value={room} placeholder="Ex. : B204" onChange={(e) => setRoom(e.target.value)} />
        </label>
        <label>
          Matière
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row end">
        <span className="muted small">Ce créneau se répète toutes les semaines.</span>
        <button className="primary" disabled={busy || !classId}>{busy ? "…" : "Ajouter au planning"}</button>
      </div>
    </form>
  );
}
