"use client";

import { useEffect, useState } from "react";
import { fetchNotice, type Notice } from "@/lib/maintenance";

// Bandeau d'avertissement avant une maintenance qui concerne le Drive
export default function MaintenanceBanner() {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const n = await fetchNotice();
      if (alive) setNotice(n);
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!notice) return null;
  return (
    <div className="banner" role="status">
      <span aria-hidden="true">🛠️</span> {notice.message}
    </div>
  );
}
