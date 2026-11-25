"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getEs } from "@/lib/espagnol";

export type Area = "work" | "resources" | "messages" | "logins";
export type BadgeCounts = Record<Area, number>;
const ZERO: BadgeCounts = { work: 0, resources: 0, messages: 0, logins: 0 };

/** Pastilles de notification : compte ce qui est nouveau depuis la dernière visite de chaque zone. */
export function useBadges(userId: string, role: "teacher" | "student", active: Area[]) {
  const [counts, setCounts] = useState<BadgeCounts>(ZERO);
  const seen = useRef<Partial<Record<Area, string>>>({});
  const activeRef = useRef<Area[]>(active);
  activeRef.current = active;

  const areas: Area[] = role === "teacher" ? ["work", "logins", "messages"] : ["work", "resources", "messages"];

  const refresh = useCallback(async () => {
    const es = getEs();
    const next: BadgeCounts = { ...ZERO };
    for (const a of areas) {
      if (activeRef.current.includes(a)) continue;
      const since = seen.current[a];
      if (!since) continue;
      let q;
      if (a === "work") {
        q = role === "teacher"
          ? es.from("es_submissions").select("id", { count: "exact", head: true }).gt("submitted_at", since)
          : es.from("es_posts").select("id", { count: "exact", head: true }).gt("created_at", since);
      } else if (a === "logins") {
        q = es.from("es_profiles").select("id", { count: "exact", head: true }).eq("role", "student").gt("first_login_at", since);
      } else if (a === "resources") {
        q = es.from("es_file_shares").select("file_id", { count: "exact", head: true }).gt("created_at", since);
      } else {
        q = es.from("es_messages").select("id", { count: "exact", head: true }).neq("sender_id", userId).gt("created_at", since);
      }
      const { count } = await q;
      next[a] = count ?? 0;
    }
    setCounts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role]);

  const markSeen = useCallback(async (a: Area) => {
    const now = new Date().toISOString();
    seen.current[a] = now;
    setCounts((c) => ({ ...c, [a]: 0 }));
    await getEs().from("es_seen").upsert({ user_id: userId, area: a, seen_at: now });
  }, [userId]);

  // Chargement initial : les zones jamais visitées démarrent à « maintenant »
  useEffect(() => {
    let stop = false;
    (async () => {
      const es = getEs();
      const { data } = await es.from("es_seen").select("area, seen_at");
      for (const r of data ?? []) seen.current[r.area as Area] = r.seen_at as string;
      const now = new Date().toISOString();
      for (const a of areas) {
        if (!seen.current[a]) {
          seen.current[a] = now;
          await es.from("es_seen").upsert({ user_id: userId, area: a, seen_at: now });
        }
      }
      if (!stop) await refresh();
    })();
    const t = setInterval(refresh, 60000);
    return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role]);

  // Entrer dans une zone (ou la quitter) la marque comme vue
  const prev = useRef<Area[]>([]);
  const key = active.join(",");
  useEffect(() => {
    for (const p of prev.current) if (!active.includes(p) && seen.current[p]) void markSeen(p);
    for (const a of active) if (seen.current[a]) void markSeen(a);
    prev.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { counts };
}
