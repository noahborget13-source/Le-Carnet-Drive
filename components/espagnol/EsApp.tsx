"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getEs, type Profile } from "@/lib/espagnol";
import NotebookMark from "../NotebookMark";
import EsAuth from "./EsAuth";
import Teacher from "./Teacher";
import Student from "./Student";

export default function EsApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const es = getEs();
    es.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = es.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    getEs()
      .from("es_profiles")
      .select("id,email,full_name,role")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else if (!data) setError("Profil introuvable. Déconnecte-toi puis reconnecte-toi.");
        else setProfile(data as Profile);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!ready) return <main className="center muted">Chargement…</main>;
  if (!session) return <EsAuth />;

  return (
    <main className="drive">
      <header className="topbar">
        <div className="brand">
          <NotebookMark size={24} />
          <span>Cours d&apos;espagnol</span>
          {profile && <span className={`badge role ${profile.role}`}>{profile.role === "teacher" ? "Professeur" : "Élève"}</span>}
        </div>
        <div className="who">
          <a href="/">← Drive</a>
          <span className="muted">{profile?.full_name || session.user.email}</span>
          <button onClick={() => getEs().auth.signOut()}>Déconnexion</button>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      {!profile ? (
        !error && <p className="muted">Chargement…</p>
      ) : profile.role === "teacher" ? (
        <Teacher userId={profile.id} />
      ) : (
        <Student userId={profile.id} />
      )}
    </main>
  );
}
