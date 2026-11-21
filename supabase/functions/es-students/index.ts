// Fonction Edge « es-students » : le prof crée / régénère / supprime des comptes élèves.
// Un élève se connecte avec son seul code : e-mail technique {code}@eleve.local + mot de passe = code.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 caractères, sans I O 0 1
function genCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
}
const emailOf = (code: string) => `${code.toLowerCase()}@eleve.local`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const admin = createClient(url, service, { auth: { persistSession: false } });

    const { data: u } = await caller.auth.getUser();
    if (!u.user) return json({ error: "Non connecté" }, 401);
    const { data: prof } = await caller.from("es_profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (prof?.role !== "teacher") return json({ error: "Réservé au professeur" }, 403);

    const body = await req.json();

    // Le prof ne peut agir que sur les élèves de ses propres classes (RLS appliquée avec son jeton)
    async function ownsStudent(id: string): Promise<boolean> {
      const { data } = await caller.from("es_members").select("class_id").eq("student_id", id).limit(1);
      return !!data && data.length > 0;
    }

    if (body.action === "create") {
      const classId = String(body.class_id ?? "");
      const names: string[] = (Array.isArray(body.names) ? body.names : [])
        .map((n: unknown) => String(n).trim())
        .filter((n: string) => n.length > 0)
        .slice(0, 100);
      if (!classId || names.length === 0) return json({ error: "Classe et noms requis" }, 400);
      const { data: cls } = await caller.from("es_classes").select("id").eq("id", classId).maybeSingle();
      if (!cls) return json({ error: "Classe introuvable" }, 404);

      const created: { id: string; full_name: string; code: string }[] = [];
      const failed: { full_name: string; error: string }[] = [];
      for (const fullName of names) {
        let done = false;
        for (let attempt = 0; attempt < 5 && !done; attempt++) {
          const code = genCode();
          const { data, error } = await admin.auth.admin.createUser({
            email: emailOf(code),
            password: code,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });
          if (error || !data.user) {
            // collision de code (très improbable) : on retente avec un autre code
            if (attempt === 4) failed.push({ full_name: fullName, error: error?.message ?? "Création impossible" });
            continue;
          }
          const id = data.user.id;
          const c = await admin.from("es_student_codes").insert({ user_id: id, code });
          const m = await admin.from("es_members").insert({ class_id: classId, student_id: id });
          if (c.error || m.error) {
            await admin.auth.admin.deleteUser(id);
            failed.push({ full_name: fullName, error: (c.error ?? m.error)!.message });
          } else {
            created.push({ id, full_name: fullName, code });
          }
          done = true;
        }
      }
      return json({ created, failed });
    }

    if (body.action === "regenerate") {
      const id = String(body.student_id ?? "");
      if (!id || !(await ownsStudent(id))) return json({ error: "Élève introuvable" }, 404);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = genCode();
        const { error } = await admin.auth.admin.updateUserById(id, { email: emailOf(code), password: code });
        if (error) continue;
        const r = await admin.from("es_student_codes").update({ code }).eq("user_id", id);
        if (r.error) return json({ error: r.error.message }, 500);
        return json({ code });
      }
      return json({ error: "Impossible de générer un nouveau code" }, 500);
    }

    if (body.action === "remove") {
      const id = String(body.student_id ?? "");
      if (!id || !(await ownsStudent(id))) return json({ error: "Élève introuvable" }, 404);
      // Supprime les fichiers rendus par l'élève (sub/{élève}/{devoir}/…)
      const storage = admin.storage.from("espagnol");
      const { data: dirs } = await storage.list(`sub/${id}`, { limit: 1000 });
      for (const d of dirs ?? []) {
        const { data: files } = await storage.list(`sub/${id}/${d.name}`, { limit: 1000 });
        const paths = (files ?? []).map((f) => `sub/${id}/${d.name}/${f.name}`);
        if (paths.length) await storage.remove(paths);
      }
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erreur" }, 500);
  }
});
