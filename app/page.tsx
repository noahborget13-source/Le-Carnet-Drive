"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { fetchMaintenance, type Maintenance as MaintenanceInfo } from "@/lib/maintenance";
import AuthForm from "@/components/AuthForm";
import Drive from "@/components/Drive";
import Maintenance from "@/components/Maintenance";

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenanceInfo | null>(null);
  const [checked, setChecked] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const checkMaintenance = useCallback(async () => {
    const m = await fetchMaintenance();
    setMaintenance(m);
    setCheckedAt(new Date());
    setChecked(true);
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Surveille la maintenance : toutes les 10 s pendant une maintenance, toutes les 30 s sinon,
  // et dès que l'onglet reprend le focus (les navigateurs ralentissent les onglets en arrière-plan).
  const inMaintenance = maintenance !== null;
  useEffect(() => {
    checkMaintenance();
    const id = setInterval(checkMaintenance, inMaintenance ? 10_000 : 30_000);
    const onVisible = () => {
      if (!document.hidden) checkMaintenance();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [checkMaintenance, inMaintenance]);

  if (!ready || !checked) return <main className="center muted">Chargement…</main>;
  if (maintenance) return <Maintenance info={maintenance} checkedAt={checkedAt} onRetry={checkMaintenance} />;
  if (!user) return <AuthForm />;
  return <Drive user={user} />;
}
