"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ConfirmOpts = { title?: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type PromptOpts = { title: string; message?: string; placeholder?: string; initial?: string; confirmLabel?: string };
type Ctx = {
  confirm: (o: ConfirmOpts | string) => Promise<boolean>;
  prompt: (o: PromptOpts) => Promise<string | null>;
};
type Active =
  | { kind: "confirm"; o: ConfirmOpts; done: (v: boolean) => void }
  | { kind: "prompt"; o: PromptOpts; done: (v: string | null) => void };

const DialogCtx = createContext<Ctx | null>(null);

// Boîtes de dialogue intégrées (remplacent confirm() et prompt() du navigateur)
export function useDialog(): Ctx {
  const c = useContext(DialogCtx);
  if (!c) throw new Error("DialogProvider manquant");
  return c;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<Active | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (o: ConfirmOpts | string) =>
      new Promise<boolean>((resolve) => setActive({ kind: "confirm", o: typeof o === "string" ? { message: o } : o, done: resolve })),
    []
  );
  const prompt = useCallback(
    (o: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setValue(o.initial ?? "");
        setActive({ kind: "prompt", o, done: resolve });
      }),
    []
  );

  function close(result: boolean | string | null) {
    if (!active) return;
    if (active.kind === "confirm") active.done(result === true);
    else active.done(typeof result === "string" ? result : null);
    setActive(null);
  }

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (active.kind === "confirm") {
          active.done(false);
        } else active.done(null);
        setActive(null);
      }
    };
    window.addEventListener("keydown", onKey);
    (active.kind === "prompt" ? inputRef.current : okRef.current)?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const danger = active?.kind === "confirm" && active.o.danger !== false;

  return (
    <DialogCtx.Provider value={{ confirm, prompt }}>
      {children}
      {active && (
        <div className="dlg-back" onClick={() => close(active.kind === "confirm" ? false : null)}>
          <form
            className="dlg"
            role="alertdialog"
            aria-modal="true"
            aria-label={active.o.title ?? "Confirmation"}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (active.kind === "confirm") close(true);
              else if (value.trim()) close(value.trim());
            }}
          >
            <h3>{active.o.title ?? "Confirmation"}</h3>
            {active.o.message && <p className="dlg-msg">{active.o.message}</p>}
            {active.kind === "prompt" && (
              <input
                ref={inputRef}
                type="text"
                value={value}
                placeholder={active.o.placeholder}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
            <div className="dlg-actions">
              <button type="button" onClick={() => close(active.kind === "confirm" ? false : null)}>
                {(active.kind === "confirm" && active.o.cancelLabel) || "Annuler"}
              </button>
              <button
                ref={okRef}
                type="submit"
                className={danger ? "primary danger-solid" : "primary"}
                disabled={active.kind === "prompt" && !value.trim()}
              >
                {active.o.confirmLabel ?? (active.kind === "confirm" ? "Confirmer" : "Valider")}
              </button>
            </div>
          </form>
        </div>
      )}
    </DialogCtx.Provider>
  );
}
