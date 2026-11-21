"use client";

import { useCallback, useEffect, useState } from "react";
import { getEs, type AppelTarget, type ClassRow, type Profile } from "@/lib/espagnol";
import Library from "./Library";
import AppelPage from "./AppelPage";
import Timetable from "./Timetable";
import TeacherClass from "./TeacherClass";

export default function Teacher({ userId }: { userId: string }) {
  const es = getEs();
  const [tab, setTab] = useState<"timetable" | "appel" | "classes" | "library">("timetable");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appel, setAppel] = useState<AppelTarget | null>(null);

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

  function openAppel(t: AppelTarget) {
    setAppel(t);
    setTab("appel");
  }

  const nav: { id: typeof tab; icon: string; label: string }[] = [
    { id: "timetable", icon: "🗓", label: "Emploi du temps" },
    { id: "appel", icon: "✅", label: "Appel" },
    { id: "classes", icon: "📒", label: "Cahier de textes" },
    { id: "library", icon: "📚", label: "Ressources" },
  ];

  return (
    <div className="shell">
      <nav className="side" aria-label="Menu professeur">
        {nav.map((n) => (
          <button key={n.id} className={tab === n.id ? "on" : ""} onClick={() => setTab(n.id)}>
            <span aria-hidden="true">{n.icon}</span> {n.label}
          </button>
        ))}
      </nav>
      <div className="content">
        {error && <p className="error">{error}</p>}
        {loading && tab !== "library" ? (
          <p className="muted">Chargement…</p>
        ) : tab === "library" ? (
          <Library userId={userId} />
        ) : tab === "timetable" ? (
          <Timetable classes={classes} userId={userId} onSelect={openAppel} />
        ) : tab === "appel" ? (
          <AppelPage classes={classes} profiles={profiles} userId={userId} target={appel} onTarget={setAppel} />
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
                onOpenAppel={openAppel}
                onDeleted={() => {
                  setSelected(null);
                  load();
                }}
              />
            ) : (
              <p className="muted empty">
                Crée ta première classe, puis ajoute tes élèves : chacun reçoit un code de connexion.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
