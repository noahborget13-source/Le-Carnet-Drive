"use client";

import { useEffect, useState } from "react";
import { getEs, type AppelTarget, type ClassRow, type Profile } from "@/lib/espagnol";
import ClassLife from "./ClassLife";

// Bilan de vie scolaire d'une classe (absences, retards, observations, historique des appels)
export default function Bilan({
  classes,
  profiles,
  onOpenAppel,
}: {
  classes: ClassRow[];
  profiles: Map<string, Profile>;
  onOpenAppel: (t: AppelTarget) => void;
}) {
  const [classId, setClassId] = useState<string | null>(classes[0]?.id ?? null);
  const [members, setMembers] = useState<string[]>([]);
  const cls = classes.find((c) => c.id === classId) ?? null;

  useEffect(() => {
    if (!classId) return;
    getEs()
      .from("es_members")
      .select("student_id")
      .eq("class_id", classId)
      .then(({ data }) => setMembers((data ?? []).map((x: { student_id: string }) => x.student_id)));
  }, [classId]);

  return (
    <div>
      <div className="class-picker">
        {classes.map((c) => (
          <button key={c.id} className={c.id === classId ? "on" : ""} onClick={() => setClassId(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      {cls ? (
        <ClassLife key={cls.id} cls={cls} members={members} profiles={profiles} onOpenAppel={onOpenAppel} />
      ) : (
        <p className="muted empty">Crée d&apos;abord une classe.</p>
      )}
    </div>
  );
}
