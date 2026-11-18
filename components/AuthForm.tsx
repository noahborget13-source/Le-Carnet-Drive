"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import NotebookMark from "./NotebookMark";

export const CARNET_URL = "https://le-carnet-beta.vercel.app";

export default function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : error.message
      );
    }
    setBusy(false);
  }

  async function google() {
    setError(null);
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  }

  return (
    <main className="center">
      <form className="card auth" onSubmit={submit}>
        <div className="logo"><NotebookMark size={34} /></div>
        <h1>Le Carnet · Drive</h1>
        <p className="muted">Connecte-toi avec ton compte Le Carnet pour accéder à tes fichiers.</p>

        <button type="button" onClick={google}>
          Continuer avec Google
        </button>

        <div className="sep muted small">ou</div>

        <label>
          Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "…" : "Se connecter"}
        </button>
        <p className="muted small">
          Pas encore de compte ? Crée-le sur{" "}
          <a href={CARNET_URL} target="_blank" rel="noreferrer">
            Le Carnet
          </a>
          .
        </p>
      </form>
    </main>
  );
}
