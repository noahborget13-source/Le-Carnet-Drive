"use client";

import { useCallback, useEffect, useState } from "react";
import { getEs, mondayOf, weekKindOf, type ClassRow, type Profile } from "@/lib/espagnol";
import NotebookMark from "../NotebookMark";
import CahierSaisie from "./CahierSaisie";
import Communication from "./Communication";
import Home from "./Home";
import Recap from "./Recap";
import Library from "./Library";
import TeacherClass from "./TeacherClass";
import Timetable from "./Timetable";
import { useBadges, type Area } from "./useBadges";

type Tab = "home" | "timetable" | "classes" | "comm" | "library";

const SUBS: Record<Tab, { id: string; label: string }[]> = {
  home: [],
  classes: [
    { id: "saisie", label: "Saisie" },
    { id: "recap", label: "Récapitulatif" },
    { id: "classes", label: "Classes et élèves" },
  ],
  timetable: [],
  comm: [{ id: "info", label: "Information" }, { id: "mail", label: "Discussion" }],
  library: [],
};

const NAV: { id: Tab; label: string }[] = [
  { id: "classes", label: "Cahier de textes" },
  { id: "timetable", label: "Emploi du temps" },
  { id: "comm", label: "Communication" },
  { id: "library", label: "Ressources" },
];

// Espace professeur : en-tête, onglets, pages (présentation inspirée de Pronote)
export default function Teacher({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const userId = profile.id;
  const es = getEs();
  const [tab, setTab] = useState<Tab>("home");
  const tabArea: Area | null = tab === "classes" ? "work" : tab === "comm" ? "messages" : null;
  const { counts } = useBadges(userId, "teacher", tabArea);
  const badgeOf = (id: string) => (id === "classes" ? counts.work : id === "comm" ? counts.messages : 0);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [q1, setQ1] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subs, setSubs] = useState<Record<Tab, string>>({
    home: "", timetable: "", classes: "saisie", comm: "info", library: "",
  });
  const sub = subs[tab];
  const setSub = (id: string) => setSubs((cur) => ({ ...cur, [tab]: id }));

  const load = useCallback(async () => {
    const [c, p, st] = await Promise.all([
      es.from("es_classes").select("id,name,code,created_at").order("created_at"),
      es.from("es_profiles").select("id,email,full_name,role,last_login_at"),
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
    if (tab === "classes" || tab === "comm" || tab === "home") load();
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
  const monday = mondayOf(new Date());
  const weekKind = weekKindOf(monday, q1);
  const dateLabel = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="pn">
      <header className="pn-header">
        <div className="pn-logo"><NotebookMark size={34} /></div>
        <div className="pn-center">
          <div className="pn-school">COURS D&apos;ESPAGNOL</div>
          <div className="pn-who">
            Espace Professeurs - {(profile.full_name || profile.email || "").toUpperCase()}
            <button className="pn-power" onClick={onSignOut} title="Déconnexion" aria-label="Déconnexion">⏻</button>
          </div>
        </div>
        <div className="pn-brandmark">
          <a href="/">Drive</a>
          <strong>Le Carnet</strong>
        </div>
      </header>

      <nav className="pn-tabs" aria-label="Menu professeur">
        <button className={`home${tab === "home" ? " on" : ""}`} onClick={() => setTab("home")} aria-label="Accueil" title="Accueil">🏠</button>
        {NAV.map((n) => (
          <button key={n.id} className={tab === n.id ? "on" : ""} onClick={() => setTab(n.id)}>{n.label}{badgeOf(n.id) > 0 && <span className="nbadge">{badgeOf(n.id)}</span>}</button>
        ))}
        <span className="grow" />
        <span className={`pn-wk wk-${weekKind}`} title="Semaine Q1 / Q2">Semaine {weekKind.toUpperCase()}</span>
        <span className="pn-date">{dateLabel}</span>
      </nav>

      {SUBS[tab].length > 0 && (
        <nav className="pn-sub" aria-label="Sous-menu">
          {SUBS[tab].map((x) => (
            <button key={x.id} className={sub === x.id ? "on" : ""} onClick={() => setSub(x.id)}>{x.label}</button>
          ))}
        </nav>
      )}

      <main className="pn-page">
        {error && <p className="error">{error}</p>}
        {tab === "library" ? (
          <>
            <h1 className="pn-title">Ressources</h1>
            <Library userId={userId} />
          </>
        ) : loading ? (
          <p className="muted">Chargement…</p>
        ) : tab === "home" ? (
          <>
            <h1 className="pn-title">Page d&apos;accueil <span>Bonjour {profile.full_name.split(/\s+/)[0] || ""}</span></h1>
            <Home classes={classes} profiles={profiles} onGo={setTab} />
          </>
        ) : tab === "comm" ? (
          <>
            <h1 className="pn-title">Communication — {sub === "mail" ? "Discussion" : "Information"}</h1>
            <Communication sub={sub === "mail" ? "mail" : "info"} classes={classes} profiles={profiles} />
          </>
        ) : tab === "timetable" ? (
          <>
            <h1 className="pn-title">Mon emploi du temps</h1>
            <Timetable classes={classes} userId={userId} />
          </>
        ) : (
          <>
            <h1 className="pn-title">Cahier de textes — {sub === "recap" ? "Récapitulatif" : sub === "classes" ? "Classes et élèves" : "Saisie"}</h1>
            {sub === "recap" ? (
              <Recap classes={classes} />
            ) : sub === "saisie" ? (
              <CahierSaisie classes={classes} userId={userId} />
            ) : (
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
            )}
          </>
        )}
      </main>
    </div>
  );
}
