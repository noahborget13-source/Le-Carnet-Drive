"use client";

import { useCallback, useEffect, useState } from "react";
import { getEs, mondayOf, weekKindOf, type AppelTarget, type ClassRow, type Profile } from "@/lib/espagnol";
import NotebookMark from "../NotebookMark";
import AppelPage from "./AppelPage";
import Bilan from "./Bilan";
import Bulletins from "./Bulletins";
import Communication from "./Communication";
import Competences from "./Competences";
import Home from "./Home";
import Notes from "./Notes";
import Library from "./Library";
import TeacherClass from "./TeacherClass";
import Timetable from "./Timetable";

type Tab = "home" | "timetable" | "classes" | "notes" | "skills" | "reports" | "life" | "comm" | "library";

const NAV: { id: Tab; icon: string; label: string }[] = [
  { id: "home", icon: "🏠", label: "Accueil" },
  { id: "timetable", icon: "🗓", label: "Emploi du temps" },
  { id: "classes", icon: "📒", label: "Cahier de textes" },
  { id: "notes", icon: "📊", label: "Notes" },
  { id: "skills", icon: "🎯", label: "Compétences" },
  { id: "reports", icon: "📄", label: "Bulletins" },
  { id: "life", icon: "✅", label: "Vie scolaire" },
  { id: "comm", icon: "✉️", label: "Communication" },
  { id: "library", icon: "📚", label: "Ressources pédagogiques" },
];

// Espace professeur : en-tête, onglets, pages (présentation inspirée de Pronote)
export default function Teacher({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const userId = profile.id;
  const es = getEs();
  const [tab, setTab] = useState<Tab>("home");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [q1, setQ1] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appel, setAppel] = useState<AppelTarget | null>(null);
  const [lifeTab, setLifeTab] = useState<"appel" | "bilan">("appel");

  const load = useCallback(async () => {
    const [c, p, st] = await Promise.all([
      es.from("es_classes").select("id,name,code,created_at").order("created_at"),
      es.from("es_profiles").select("id,email,full_name,role"),
      es.from("es_settings").select("q1_monday").limit(1).maybeSingle(),
    ]);
    if (c.error) setError(c.error.message);
    else if (p.error) setError(p.error.message);
    else {
      const list = (c.data ?? []) as ClassRow[];
      setClasses(list);
      setProfiles(new Map(((p.data ?? []) as Profile[]).map((x): [string, Profile] => [x.id, x])));
      setQ1((st.data as { q1_monday: string } | null)?.q1_monday ?? null);
      setSelected((cur) => (cur && list.some((x) => x.id === cur) ? cur : list[0]?.id ?? null));
    }
    setLoading(false);
  }, [es]);

  useEffect(() => {
    load();
  }, [load]);

  // Rafraîchit les noms des élèves quand on revient sur une page qui les utilise
  useEffect(() => {
    if (tab === "classes" || tab === "life" || tab === "notes" || tab === "skills" || tab === "reports" || tab === "comm" || tab === "home") load();
  }, [tab, load]);

  async function newClass() {
    const name = window.prompt("Nom de la classe (ex. 2nde B — Espagnol LV2) :")?.trim();
    if (!name) return;
    const { data, error } = await es.from("es_classes").insert({ name }).select("id").single();
    if (error) return setError(error.message);
    await load();
    if (data) setSelected(data.id);
  }

  function openAppel(t: AppelTarget) {
    setAppel(t);
    setLifeTab("appel");
    setTab("life");
  }

  const current = classes.find((c) => c.id === selected) ?? null;
  const monday = mondayOf(new Date());
  const weekKind = weekKindOf(monday, q1);
  const dateLabel = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="pn">
      <header className="pn-header">
        <div className="pn-brand">
          <NotebookMark size={26} />
          <span>Cours d&apos;espagnol</span>
          <span className="pn-role">Espace Professeur</span>
        </div>
        <div className="pn-head-right">
          <span className="pn-date">{dateLabel}</span>
          <span className={`badge wk-${weekKind} pn-week`} title="Semaine Q1 / Q2">Semaine {weekKind.toUpperCase()}</span>
          <a href="/">Drive</a>
          <span className="pn-user">{profile.full_name || profile.email}</span>
          <button onClick={onSignOut}>Déconnexion</button>
        </div>
      </header>

      <nav className="pn-tabs" aria-label="Menu professeur">
        {NAV.map((n) => (
          <button key={n.id} className={tab === n.id ? "on" : ""} onClick={() => setTab(n.id)}>
            <span className="ico" aria-hidden="true">{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>

      <main className="pn-page">
        {error && <p className="error">{error}</p>}
        {tab === "library" ? (
          <>
            <h1 className="pn-title">Ressources pédagogiques</h1>
            <Library userId={userId} />
          </>
        ) : loading ? (
          <p className="muted">Chargement…</p>
        ) : tab === "home" ? (
          <>
            <h1 className="pn-title">Bonjour {profile.full_name.split(/\s+/)[0] || ""} 👋</h1>
            <Home classes={classes} profiles={profiles} onOpenAppel={openAppel} onGo={setTab} />
          </>
        ) : tab === "timetable" ? (
          <>
            <h1 className="pn-title">Mon emploi du temps</h1>
            <Timetable classes={classes} userId={userId} onSelect={openAppel} />
          </>
        ) : tab === "notes" ? (
          <>
            <h1 className="pn-title">Notes</h1>
            <Notes classes={classes} profiles={profiles} />
          </>
        ) : tab === "skills" ? (
          <>
            <h1 className="pn-title">Compétences</h1>
            <Competences classes={classes} profiles={profiles} />
          </>
        ) : tab === "reports" ? (
          <>
            <h1 className="pn-title">Bulletins</h1>
            <Bulletins classes={classes} profiles={profiles} />
          </>
        ) : tab === "comm" ? (
          <>
            <h1 className="pn-title">Communication</h1>
            <Communication classes={classes} profiles={profiles} />
          </>
        ) : tab === "life" ? (
          <>
            <h1 className="pn-title">Vie scolaire</h1>
            <div className="pn-subtabs">
              <button className={lifeTab === "appel" ? "on" : ""} onClick={() => setLifeTab("appel")}>Appel</button>
              <button className={lifeTab === "bilan" ? "on" : ""} onClick={() => setLifeTab("bilan")}>Bilan et observations</button>
            </div>
            {lifeTab === "appel" ? (
              <AppelPage classes={classes} profiles={profiles} userId={userId} target={appel} onTarget={setAppel} />
            ) : (
              <Bilan classes={classes} profiles={profiles} onOpenAppel={openAppel} />
            )}
          </>
        ) : (
          <>
            <h1 className="pn-title">Cahier de textes</h1>
            <div className="pn-split">
              <aside className="pn-list">
                <h3>Mes classes</h3>
                {classes.map((c) => (
                  <button key={c.id} className={c.id === selected ? "on" : ""} onClick={() => setSelected(c.id)}>
                    {c.name}
                  </button>
                ))}
                <button className="add" onClick={newClass}>+ Nouvelle classe</button>
              </aside>
              <div className="pn-main">
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
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
