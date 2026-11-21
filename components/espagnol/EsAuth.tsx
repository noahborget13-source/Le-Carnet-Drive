"use client";

import { useState } from "react";
import { formatCode, getEs, normalizeCode, studentEmail } from "@/lib/espagnol";
import NotebookMark from "../NotebookMark";

type Mode = "code" | "teacher-login" | "teacher-signup";

export default function EsAuth() {
  const [mode, setMode] = useState<Mode>("code");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setInfo(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const es = getEs();

    if (mode === "code") {
      const c = normalizeCode(code);
      const { error } = await es.auth.signInWithPassword({ email: studentEmail(c), password: c });
      if (error) {
        setError(
          error.message === "Invalid login credentials"
            ? "Code incorrect. Vérifie-le ou demande-le à ton professeur."
            : error.message
        );
      }
    } else if (mode === "teacher-login") {
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
      else if (!data.session) {
        setInfo("Compte créé ! Clique sur le lien reçu par email pour confirmer ton adresse, puis connecte-toi.");
      }
    }
    setBusy(false);
  }

  const isCode = mode === "code";

  return (
    <main className="center">
      <form className="card auth" onSubmit={submit}>
        <div className="logo"><NotebookMark size={34} /></div>
        <h1>Cours d&apos;espagnol</h1>
        <p className="muted">
          {isCode
            ? "Entre le code que ton professeur t'a donné."
            : mode === "teacher-login"
              ? "Espace professeur : connecte-toi avec ton email."
              : "Espace professeur : crée ton compte (avec l'adresse enregistrée pour le professeur)."}
        </p>

        {isCode ? (
          <label>
            Ton code
            <input
              className="code-input"
              type="text"
              required
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXX-XXXX"
              maxLength={9}
              value={code}
              onChange={(e) => setCode(formatCode(normalizeCode(e.target.value).slice(0, 8)))}
            />
          </label>
        ) : (
          <>
            {mode === "teacher-signup" && (
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
                autoComplete={mode === "teacher-login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </>
        )}

        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}
        <button className="primary" disabled={busy || (isCode && normalizeCode(code).length !== 8)}>
          {busy ? "…" : isCode ? "Entrer" : mode === "teacher-login" ? "Se connecter" : "Créer mon compte"}
        </button>

        <p className="muted small">
          {isCode ? (
            <>
              Tu es le professeur ?{" "}
              <button type="button" className="link" onClick={() => switchMode("teacher-login")}>
                Espace professeur
              </button>
            </>
          ) : (
            <>
              {mode === "teacher-login" ? (
                <button type="button" className="link" onClick={() => switchMode("teacher-signup")}>
                  Première visite ? Créer le compte professeur
                </button>
              ) : (
                <button type="button" className="link" onClick={() => switchMode("teacher-login")}>
                  J&apos;ai déjà un compte
                </button>
              )}
              {" · "}
              <button type="button" className="link" onClick={() => switchMode("code")}>
                Je suis élève
              </button>
            </>
          )}
        </p>
      </form>
    </main>
  );
}
