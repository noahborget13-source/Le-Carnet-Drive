"use client";

import { useEffect, useState } from "react";
import { KIND_LABEL, POST_SELECT, getEs, postSortKey, sessionLabel, type ClassRow, type Post } from "@/lib/espagnol";

// Récapitulatif du cahier de textes : contenus et travail donné, classés par cours
export default function Recap({ classes }: { classes: ClassRow[] }) {
  const [classId, setClassId] = useState<string | null>(classes[0]?.id ?? null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!classId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getEs()
      .from("es_posts")
      .select(POST_SELECT)
      .eq("class_id", classId)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setPosts(((data ?? []) as unknown as Post[]).sort((a, b) => postSortKey(a).localeCompare(postSortKey(b))));
        setLoading(false);
      });
  }, [classId]);

  return (
    <div>
      <div className="notes-bar">
        <div className="class-picker">
          {classes.map((c) => (
            <button key={c.id} className={c.id === classId ? "on" : ""} onClick={() => setClassId(c.id)}>{c.name}</button>
          ))}
        </div>
        <span className="grow" />
        <button onClick={() => window.print()}>🖨 Imprimer</button>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Chargement…</p>
      ) : posts.length === 0 ? (
        <p className="muted empty">Rien dans le cahier de textes.</p>
      ) : (
        <div className="table-wrap">
          <table className="appel-table recap-table">
            <thead>
              <tr>
                <th className="left">Cours</th>
                <th className="left">Contenu</th>
                <th className="left">Travail à faire</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td className="left">{p.given ? sessionLabel(p.given) : new Date(p.created_at).toLocaleDateString("fr-FR")}</td>
                  <td className="left">
                    {p.kind === "resource" || p.kind === "announcement" ? (
                      <>
                        <strong>{p.title}</strong>
                        {p.body && <div className="small">{p.body}</div>}
                      </>
                    ) : null}
                  </td>
                  <td className="left">
                    {p.kind === "todo" || p.kind === "assignment" ? (
                      <>
                        <span className="badge">{KIND_LABEL[p.kind]}</span> <strong>{p.title}</strong>
                        {p.due && <div className="small">Pour le cours du {sessionLabel(p.due)}</div>}
                        {p.body && <div className="small">{p.body}</div>}
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
