"use client";

import { useState } from "react";
import NotebookMark from "./NotebookMark";
import type { Maintenance as MaintenanceInfo } from "@/lib/maintenance";

function backText(end: string | null): string {
  if (!end) return "";
  const d = new Date(end);
  if (isNaN(d.getTime())) return "";
  const sameDay = d.toDateString() === new Date().toDateString();
  return (
    "Retour prévu " +
    (sameDay ? "vers " : "le ") +
    d.toLocaleString(
      "fr-FR",
      sameDay
        ? { hour: "2-digit", minute: "2-digit" }
        : { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }
    )
  );
}

export default function Maintenance({
  info,
  checkedAt,
  onRetry,
}: {
  info: MaintenanceInfo;
  checkedAt: Date | null;
  onRetry: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    await onRetry();
    setBusy(false);
  }

  const back = backText(info.maint_end);

  return (
    <main className="maint">
      <NotebookMark size={40} />
      <h1>Nous revenons très vite !</h1>
      <p>Le Drive est actuellement en cours de maintenance. Merci de votre patience.</p>
      {back && <p className="back">{back}</p>}
      <small>
        Cette page se rafraîchit toute seule : tu retrouveras tes fichiers dès que c&apos;est terminé.
        {checkedAt ? ` Dernière vérification à ${checkedAt.toLocaleTimeString("fr-FR")}.` : ""}
      </small>
      <button className="primary" onClick={retry} disabled={busy}>
        {busy ? "Vérification…" : "Vérifier maintenant"}
      </button>
    </main>
  );
}
