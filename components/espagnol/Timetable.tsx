"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DAYS,
  WEEK_LABEL,
  addDays,
  appelKey,
  formatShortDay,
  getEs,
  hhmm,
  mondayOf,
  toYmd,
  weekKindOf,
  type AppelTarget,
  type ClassRow,
  type Session,
  type Slot,
  type WeekKind,
} from "@/lib/espagnol";

const HOUR_PX = 56;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const slotTime = (s: { start_time: string; end_time: string }) => `${hhmm(s.start_time)}–${hhmm(s.end_time)}`;

type Props = {
  classes: ClassRow[];
  userId?: string; // prof : nécessaire pour régler les semaines Q1 / Q2
  readOnly?: boolean; // élève : consultation seule
  picker?: boolean; // version compacte pour choisir un cours (page d'appel)
  selectedKey?: string | null;
  onSelect?: (t: AppelTarget) => void;
};

// Emploi du temps : créneaux hebdomadaires (classe, salle), semaines Q1 / Q2, accès à l'appel
export default function Timetable({ classes, userId, readOnly, picker, selectedKey, onSelect }: Props) {
  const es = getEs();
  const [week, setWeek] = useState<Date>(() => mondayOf(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [q1Monday, setQ1Monday] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [active, setActive] = useState<{ slot: Slot; date: string } | null>(null);

  const weekStart = toYmd(week);
  const weekEnd = toYmd(addDays(week, 6));
  const kind = weekKindOf(week, q1Monday);

  const load = useCallback(async () => {
    const [s, st, x] = await Promise.all([
      es.from("es_slots").select("*").order("start_time"),
      es.from("es_settings").select("q1_monday").limit(1).maybeSingle(),
      readOnly
        ? Promise.resolve({ data: [], error: null })
        : es.from("es_sessions").select("*").gte("date", weekStart).lte("date", weekEnd),
    ]);
    if (s.error) setError(s.error.message);
    else if (st.error) setError(st.error.message);
    else if (x.error) setError(x.error.message);
    else {
      setSlots((s.data ?? []) as Slot[]);
      setQ1Monday((st.data as { q1_monday: string } | null)?.q1_monday ?? null);
      setSessions((x.data ?? []) as Session[]);
    }
    setLoading(false);
  }, [es, weekStart, weekEnd, readOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const classOf = useMemo(() => new Map(classes.map((c): [string, ClassRow] => [c.id, c])), [classes]);
  const today = toYmd(new Date());
  const visible = slots.filter((s) => s.week === "all" || s.week === kind);
  const startH = Math.max(6, Math.min(8, ...visible.map((s) => Math.floor(minutes(s.start_time) / 60))));
  const endH = Math.min(22, Math.max(17, ...visible.map((s) => Math.ceil(minutes(s.end_time) / 60))));
  const lastDay = !picker && slots.some((s) => s.weekday >= 6) ? 6 : 5;
  const days = Array.from({ length: lastDay }, (_, i) => i + 1);

  async function setThisWeekKind(k: "q1" | "q2") {
    if (!userId) return;
    // le lundi de référence « Q1 » : cette semaine si on veut Q1, sinon la semaine suivante
    const anchor = k === "q1" ? weekStart : toYmd(addDays(week, 7));
    const { error } = await es
      .from("es_settings")
      .upsert({ teacher_id: userId, q1_monday: anchor, updated_at: new Date().toISOString() }, { onConflict: "teacher_id" });
    if (error) setError(error.message);
    else setQ1Monday(anchor);
  }

  async function removeSlot(s: Slot) {
    if (!window.confirm("Supprimer ce créneau de l'emploi du temps ? (les appels déjà faits sont conservés)")) return;
    const { error } = await es.from("es_slots").delete().eq("id", s.id);
    if (error) setError(error.message);
    else await load();
  }

  function targetOf(s: Slot, date: string): AppelTarget | null {
    const cls = classOf.get(s.class_id);
    if (!cls) return null;
    return { cls, date, start: hhmm(s.start_time), end: hhmm(s.end_time), room: s.room, slotId: s.id };
  }

  return (
    <section className={picker ? "tt picker" : "tt"}>
      <div className="week-nav">
        <button onClick={() => setWeek(addDays(week, -7))} aria-label="Semaine précédente">←</button>
        <strong>
          {picker ? "" : "Semaine du "}
          {formatShortDay(weekStart)} → {formatShortDay(toYmd(addDays(week, days.length - 1)))}
        </strong>
        <button onClick={() => setWeek(addDays(week, 7))} aria-label="Semaine suivante">→</button>
        <button onClick={() => setWeek(mondayOf(new Date()))}>Aujourd&apos;hui</button>
        <span className={`badge wk-${kind}`} title="Semaine Q1 / Q2">{kind.toUpperCase()}</span>
        {userId && !readOnly && !picker && (
          <label className="inline small">
            Cette semaine est
            <select value={kind} onChange={(e) => setThisWeekKind(e.target.value as "q1" | "q2")} aria-label="Cette semaine est Q1 ou Q2">
              <option value="q1">Q1</option>
              <option value="q2">Q2</option>
            </select>
          </label>
        )}
        <span className="grow" />
        {!readOnly && !picker && <button onClick={() => setAdding(!adding)}>{adding ? "Fermer" : "+ Ajouter un créneau"}</button>}
      </div>

      {error && <p className="error">{error}</p>}
      {adding && !readOnly && (
        <SlotForm
          classes={classes}
          onCreated={async () => {
            await load();
            setAdding(false);
          }}
        />
      )}
      {!readOnly && classes.length === 0 && (
        <p className="muted empty">Crée d&apos;abord une classe (onglet Classes) pour pouvoir remplir ton emploi du temps.</p>
      )}

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : (
        <>
          {active && !readOnly && !picker && (
            <div className="slot-bar">
              <span>
                <strong>{classOf.get(active.slot.class_id)?.name ?? "Classe"}</strong> · {formatShortDay(active.date)} ·{" "}
                {slotTime(active.slot)}
                {active.slot.room ? ` · salle ${active.slot.room}` : ""}
              </span>
              <span className="grow" />
              <button className="danger" onClick={() => removeSlot(active.slot).then(() => setActive(null))}>
                Supprimer le créneau
              </button>
              <button onClick={() => setActive(null)} aria-label="Fermer">✕</button>
            </div>
          )}
          <div className="tg-wrap">
            <div className={picker ? "tg compact" : "tg"} style={{ gridTemplateColumns: picker ? `34px repeat(${days.length}, minmax(70px, 1fr))` : `46px repeat(${days.length}, minmax(120px, 1fr))` }}>
              <div className="tg-corner" />
              {days.map((wd) => {
                const date = toYmd(addDays(week, wd - 1));
                return (
                  <div key={wd} className={`tg-head${date === today ? " today" : ""}`}>
                    <strong>{DAYS[wd - 1]}</strong>
                    <span className="muted small">{formatShortDay(date).replace(/^\S+\s/, "")}</span>
                  </div>
                );
              })}
              <div className="tg-hours" style={{ height: (endH - startH) * HOUR_PX }}>
                {Array.from({ length: endH - startH }, (_, i) => (
                  <div key={i} className="tg-hour" style={{ top: i * HOUR_PX }}>
                    {String(startH + i).padStart(2, "0")}h
                  </div>
                ))}
              </div>
              {days.map((wd) => {
                const date = toYmd(addDays(week, wd - 1));
                const daySlots = slots.filter((s) => s.weekday === wd && (s.week === "all" || s.week === kind));
                return (
                  <div
                    key={wd}
                    className={`tg-col${date === today ? " today" : ""}`}
                    style={{ height: (endH - startH) * HOUR_PX }}
                  >
                    {daySlots.map((s) => {
                      const cls = classOf.get(s.class_id);
                      const idx = Math.max(0, classes.findIndex((c) => c.id === s.class_id));
                      const top = ((minutes(s.start_time) - startH * 60) * HOUR_PX) / 60;
                      const height = Math.max(26, ((minutes(s.end_time) - minutes(s.start_time)) * HOUR_PX) / 60);
                      const session = sessions.find(
                        (x) => x.class_id === s.class_id && x.date === date && hhmm(x.start_time) === hhmm(s.start_time)
                      );
                      const isActive = active?.slot.id === s.id && active.date === date;
                      return (
                        <button
                          key={s.id}
                          className={`tg-slot${isActive || (picker && selectedKey === `${s.class_id}|${date}|${hhmm(s.start_time)}`) ? " active" : ""}${session?.validated_at ? " done" : ""}`}
                          style={{ top, height, "--hue": String((idx * 57 + 205) % 360) } as React.CSSProperties}
                          disabled={readOnly}
                          onClick={() => {
                            if (picker) {
                              const t = targetOf(s, date);
                              if (t) onSelect?.(t);
                            } else setActive({ slot: s, date });
                          }}
                          title={`${cls?.name ?? ""} ${slotTime(s)}`}
                        >
                          <span className="tg-time">
                            {slotTime(s)}
                            {s.week !== "all" && <span className={`badge wk-${s.week}`}>{s.week.toUpperCase()}</span>}
                          </span>
                          <strong>{readOnly && classes.length <= 1 ? s.subject : (cls?.name ?? "Classe")}</strong>
                          <span className="tg-meta">
                            {readOnly && classes.length <= 1 ? "" : `${s.subject}`}
                            {s.room ? ` · ${s.room}` : ""}
                          </span>
                          {session?.validated_at && <span className="tg-ok">✓ appel</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </>
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
  const [week, setWeekKind] = useState<WeekKind>("all");
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
      week,
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
        <label>
          Semaines
          <select value={week} onChange={(e) => setWeekKind(e.target.value as WeekKind)}>
            {(Object.keys(WEEK_LABEL) as WeekKind[]).map((k) => (
              <option key={k} value={k}>{WEEK_LABEL[k]}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row end">
        <span className="muted small">Un créneau « Q1 » ou « Q2 » n&apos;apparaît qu&apos;une semaine sur deux.</span>
        <button className="primary" disabled={busy || !classId}>{busy ? "…" : "Ajouter au planning"}</button>
      </div>
    </form>
  );
}
