"use client";

import { useState } from "react";
import { getEs } from "@/lib/espagnol";
import NotebookMark from "../NotebookMark";

export default function EsAuth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const es = getEs();
    if (mode === "login") {
      const { error } = await es.auth.signInWithPassword({ email, password });
      if (error) {
        setError(
          error.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : error.message
        );
      }
    } else {
      const { data, error } = await es.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: `${window.location.origin}/espagnol`,
        },
      });
      if (error) setError(error.message);
      else if (!data.session) setInfo("Compte créé ! Clique sur le lien reçu par email pour confirmer ton adresse, puis connecte-toi.");
    }
    setBusy(false);
  }

  return (
    <main className="center">
      <form className="card auth" onSubmit={submit}>
        <div className="logo"><NotebookMark size={34} /></div>
        <h1>Cours d&apos;espagnol</h1>
        <p className="muted">
          {mode === "login"
            ? "Connecte-toi pour retrouver les cours et les devoirs."
            : "Crée ton compte (élèves : tu rejoindras ta classe avec un code)."}
        </p>

        {mode === "signup" && (
          <label>
            Prénom et nom
            <input type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label>
          Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
        </button>
        <p className="muted small">
          {mode === "login" ? "Pas encore de compte ? " : "Déjà un compte ? "}
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setInfo(null);
            }}
          >
            {mode === "login" ? "Créer un compte" : "Se connecter"}
          </button>
        </p>
        <p className="small">
          <a href="/">← Retour au Drive</a>
        </p>
      </form>
    </main>
  );
}
