"use client";

import { useState } from "react";
import { callStudents, formatCode, type CreatedStudent, type Profile } from "@/lib/espagnol";

type Props = {
  classId: string;
  className: string;
  members: string[];
  profiles: Map<string, Profile>;
  codes: Map<string, string>;
  onChanged: () => void;
};

// Gestion des élèves d'une classe : création de comptes (un code par élève), codes, suppression
export default function StudentsPanel({ classId, className, members, profiles, codes, onChanged }: Props) {
  const [names, setNames] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = members
    .map((id) => ({
      id,
      name: profiles.get(id)?.full_name || "(sans nom)",
      code: codes.get(id) ?? "",
      loggedIn: !!profiles.get(id)?.last_login_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const list = names.split("\n").map((n) => n.trim()).filter(Boolean);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { data, error } = await callStudents<{ created: CreatedStudent[]; failed: { full_name: string; error: string }[] }>({
      action: "create",
      class_id: classId,
      names: list,
    });
    setBusy(false);
    if (error || !data) return setError(error ?? "Création impossible.");
    const failed = data.failed.map((f) => `${f.full_name} (${f.error})`);
    if (failed.length) setError(`Non créés : ${failed.join(", ")}`);
    setNotice(`${data.created.length} compte${data.created.length > 1 ? "s" : ""} créé${data.created.length > 1 ? "s" : ""}.`);
    setNames(failed.length ? data.failed.map((f) => f.full_name).join("\n") : "");
    onChanged();
  }

  async function regenerate(id: string, name: string) {
    if (!window.confirm(`Générer un nouveau code pour ${name} ? L'ancien code ne fonctionnera plus.`)) return;
    setError(null);
    const { error } = await callStudents<{ code: string }>({ action: "regenerate", student_id: id });
    if (error) setError(error);
    else onChanged();
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Supprimer le compte de ${name} ? Ses rendus seront supprimés. Cette action est définitive.`)) return;
    setError(null);
    const { error } = await callStudents<{ ok: boolean }>({ action: "remove", student_id: id });
    if (error) setError(error);
    else onChanged();
  }

  function copyList() {
    const text = rows.map((r) => `${r.name} — ${formatCode(r.code)}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => setNotice("Liste copiée."));
  }

  function printList() {
    const w = window.open("", "_blank");
    if (!w) return setError("Autorise les fenêtres pop-up pour imprimer.");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.write(
      `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Codes — ${esc(className)}</title>` +
        `<style>body{font-family:system-ui,sans-serif;padding:24px}h1{font-size:20px}` +
        `.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}` +
        `.c{border:1px dashed #888;border-radius:8px;padding:12px;break-inside:avoid}` +
        `.n{font-weight:600}.k{font:700 22px ui-monospace,monospace;letter-spacing:.1em;margin-top:6px}</style></head><body>` +
        `<h1>Cours d'espagnol — ${esc(className)}</h1><p>Va sur le site, entre ton code et c'est tout.</p><div class="grid">` +
        rows.map((r) => `<div class="c"><div class="n">${esc(r.name)}</div><div class="k">${esc(formatCode(r.code))}</div></div>`).join("") +
        `</div><script>window.onload=()=>window.print()</script></body></html>`
    );
    w.document.close();
  }

  return (
    <div>
      <form className="card composer" onSubmit={create}>
        <label>
          Ajouter des élèves (un par ligne : Prénom Nom)
          <textarea
            rows={4}
            value={names}
            onChange={(e) => setNames(e.target.value)}
            placeholder={"Lucía Fernández\nMarc Dupont"}
          />
        </label>
        <div className="row end">
          <span className="muted small">Un code de connexion est généré pour chaque élève, sans adresse email.</span>
          <button className="primary" disabled={busy || !names.trim()}>
            {busy ? "Création…" : "Créer les comptes"}
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}
      {notice && <p className="info">{notice}</p>}

      {rows.length === 0 ? (
        <p className="muted empty">Aucun élève pour l&apos;instant.</p>
      ) : (
        <>
          <div className="post-actions" style={{ marginTop: 0, marginBottom: 10 }}>
            <button onClick={printList}>🖨 Imprimer les codes</button>
            <button onClick={copyList}>Copier la liste</button>
          </div>
          <ul className="list simple students">
            {rows.map((r) => (
              <li key={r.id}>
                <span className="text">
                  <span
                    className={`login-dot ${r.loggedIn ? "on" : "off"}`}
                    title={r.loggedIn ? "S'est déjà connecté avec son code" : "N'a pas encore tapé son code"}
                    role="img"
                    aria-label={r.loggedIn ? "Connecté au moins une fois" : "Jamais connecté"}
                  />
                  {r.name}
                </span>
                <span className="code">{formatCode(r.code)}</span>
                <span className="actions">
                  <button onClick={() => navigator.clipboard?.writeText(formatCode(r.code))}>Copier</button>
                  <button onClick={() => regenerate(r.id, r.name)}>Nouveau code</button>
                  <button className="danger" onClick={() => remove(r.id, r.name)}>Supprimer</button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
