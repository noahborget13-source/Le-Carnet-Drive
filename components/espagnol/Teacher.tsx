"use client";

import { useCallback, useEffect, useState } from "react";
import { getEs, type ClassRow, type Profile } from "@/lib/espagnol";
import Library from "./Library";
import Timetable from "./Timetable";
import TeacherClass from "./TeacherClass";

export default function Teacher({ userId }: { userId: string }) {
  const es = getEs();
  const [tab, setTab] = useState<"classes" | "timetable" | "library">("classes");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, p] = await Promise.all([
      es.from("es_classes").select("id,name,code,created_at").order("created_at"),
      es.from("es_profiles").select("id,email,full_name,role"),
    ]);
    if (c.error) setError(c.error.message);
    else if (p.error) setError(p.error.message);
    else {
      const list = (c.data ?? []) as ClassRow[];
      setClasses(list);
      setProfiles(new Map(((p.data ?? []) as Profile[]).map((x): [string, Profile] => [x.id, x])));
      setSelected((cur) => (cur && list.some((x) => x.id === cur) ? cur : list[0]?.id ?? null));
    }
    setLoading(false);
  }, [es]);

  useEffect(() => {
    load();
  }, [load]);

  // Rafraîchit les noms des élèves quand on revient sur l'onglet Classes
  useEffect(() => {
    if (tab === "classes") load();
  }, [tab, load]);

  async function newClass() {
    const name = window.prompt("Nom de la classe (ex. 2nde B — Espagnol LV2) :")?.trim();
    if (!name) return;
    const { data, error } = await es.from("es_classes").insert({ name }).select("id").single();
    if (error) return setError(error.message);
    await load();
    if (data) setSelected(data.id);
  }

  const current = classes.find((c) => c.id === selected) ?? null;

  return (
    <>
      <div className="tabs">
        <button className={tab === "classes" ? "on" : ""} onClick={() => setTab("classes")}>👩‍🏫 Classes</button>
        <button className={tab === "timetable" ? "on" : ""} onClick={() => setTab("timetable")}>🗓 Emploi du temps</button>
        <button className={tab === "library" ? "on" : ""} onClick={() => setTab("library")}>📚 Bibliothèque</button>
      </div>
      {error && <p className="error">{error}</p>}

      {tab === "library" ? (
        <Library userId={userId} />
      ) : tab === "timetable" ? (
        loading ? <p className="muted">Chargement…</p> : <Timetable classes={classes} profiles={profiles} />
      ) : loading ? (
        <p className="muted">Chargement…</p>
      ) : (
        <>
          <div className="class-picker">
            {classes.map((c) => (
              <button key={c.id} className={c.id === selected ? "on" : ""} onClick={() => setSelected(c.id)}>
                {c.name}
              </button>
            ))}
            <button className="primary" onClick={newClass}>+ Nouvelle classe</button>
          </div>
          {current ? (
            <TeacherClass
              key={current.id}
              userId={userId}
              cls={current}
              profiles={profiles}
              onProfilesChanged={load}
              onDeleted={() => {
                setSelected(null);
                load();
              }}
            />
          ) : (
            <p className="muted empty">
              Crée ta première classe : tu obtiendras un code à donner à tes élèves pour qu&apos;ils la rejoignent.
            </p>
          )}
        </>
      )}
    </>
  );
}
