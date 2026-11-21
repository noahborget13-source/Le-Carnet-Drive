"use client";

import { useState } from "react";
import { appelKey, type AppelTarget, type ClassRow, type Profile } from "@/lib/espagnol";
import AppelSheet from "./Appel";
import Timetable from "./Timetable";

// Page « Appel » façon Pronote : la liste d'appel à gauche, l'emploi du temps à droite pour choisir le cours
export default function AppelPage({
  classes,
  profiles,
  userId,
  target,
  onTarget,
}: {
  classes: ClassRow[];
  profiles: Map<string, Profile>;
  userId: string;
  target: AppelTarget | null;
  onTarget: (t: AppelTarget) => void;
}) {
  // incrémenté à chaque saisie pour rafraîchir les pastilles « appel fait » de l'emploi du temps
  const [tick, setTick] = useState(0);

  return (
    <div className="appel-page">
      <div className="appel-main">
        {target ? (
          <AppelSheet key={appelKey(target)} target={target} profiles={profiles} onSaved={() => setTick((n) => n + 1)} />
        ) : (
          <p className="muted empty">Choisis un cours dans l&apos;emploi du temps à droite pour faire l&apos;appel.</p>
        )}
      </div>
      <aside className="appel-side">
        <h3>Choisir le cours</h3>
        <Timetable
          key={tick}
          picker
          classes={classes}
          userId={userId}
          selectedKey={target ? appelKey(target) : null}
          onSelect={onTarget}
        />
      </aside>
    </div>
  );
}
