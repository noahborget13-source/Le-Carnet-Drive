"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getEs, type Profile } from "@/lib/espagnol";
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

  if (profile?.role === "teacher") {
    return <Teacher profile={profile} onSignOut={() => getEs().auth.signOut()} />;
  }

  if (profile) {
    return <Student userId={profile.id} name={profile.full_name} onSignOut={() => getEs().auth.signOut()} />;
  }

  return (
    <main className="drive">
      {error ? (
        <>
          <p className="error">{error}</p>
          <button onClick={() => getEs().auth.signOut()}>Déconnexion</button>
        </>
      ) : (
        <p className="muted">Chargement…</p>
      )}
    </main>
  );
}
