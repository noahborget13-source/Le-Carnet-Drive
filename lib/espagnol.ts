import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { safeName } from "./files";

// Les cours d'espagnol utilisent leur propre projet Supabase (comptes prof/élèves séparés de Le Carnet)
let client: SupabaseClient | null = null;

export function getEs(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_ESPAGNOL_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_ESPAGNOL_SUPABASE_KEY;
    if (!url || !key) {
      throw new Error(
        "Variables NEXT_PUBLIC_ESPAGNOL_SUPABASE_URL et NEXT_PUBLIC_ESPAGNOL_SUPABASE_KEY manquantes."
      );
    }
    client = createClient(url, key, { auth: { storageKey: "espagnol-auth" } });
  }
  return client;
}

export const ES_BUCKET = "espagnol";
export const MAX_SIZE = 50 * 1024 * 1024; // 50 Mo, aligné sur la limite du bucket

export type Role = "teacher" | "student";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  role: Role;
};

export type ClassRow = {
  id: string;
  name: string;
  code: string;
  created_at: string;
};

export type Folder = {
  id: string;
  parent_id: string | null;
  name: string;
};

export type EsFile = {
  id: string;
  folder_id: string | null;
  name: string;
  path: string;
  size: number;
  mime_type: string | null;
  created_at: string;
};

export type SubFile = {
  id: string;
  submission_id: string;
  name: string;
  path: string;
  size: number;
  mime_type: string | null;
};

export type PostKind = "resource" | "assignment" | "todo" | "announcement";

export const KIND_LABEL: Record<PostKind, string> = {
  resource: "Ressource",
  assignment: "Travail à rendre",
  todo: "Travail à faire",
  announcement: "Annonce",
};

export type Post = {
  id: string;
  class_id: string;
  kind: PostKind;
  title: string;
  body: string;
  due_at: string | null;
  published: boolean;
  created_at: string;
  es_post_files: { es_files: EsFile | null }[];
};

export type Submission = {
  id: string;
  post_id: string;
  student_id: string;
  body: string;
  submitted_at: string;
  grade: string | null;
  feedback: string | null;
  es_submission_files: SubFile[];
};

export function postFiles(p: Post): EsFile[] {
  return p.es_post_files.map((x) => x.es_files).filter((f): f is EsFile => f !== null);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Valeur d'un <input type="datetime-local"> (heure locale) → ISO
export function localToIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export async function downloadFile(f: { name: string; path: string }): Promise<string | null> {
  const { data, error } = await getEs().storage.from(ES_BUCKET).createSignedUrl(f.path, 60, { download: f.name });
  if (error || !data) return error?.message ?? "Téléchargement impossible.";
  window.location.href = data.signedUrl;
  return null;
}

// Envoie des fichiers dans la bibliothèque du prof ; renvoie les fichiers créés et les erreurs
export async function uploadToLibrary(
  files: File[],
  userId: string,
  folderId: string | null,
  onProgress?: (name: string | null) => void
): Promise<{ created: EsFile[]; errors: string[] }> {
  const es = getEs();
  const created: EsFile[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (file.size > MAX_SIZE) {
      errors.push(`${file.name} dépasse la limite de 50 Mo.`);
      continue;
    }
    onProgress?.(file.name);
    const path = `lib/${userId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error: upErr } = await es.storage
      .from(ES_BUCKET)
      .upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (upErr) {
      errors.push(`${file.name} : ${upErr.message}`);
      continue;
    }
    const { data, error: dbErr } = await es
      .from("es_files")
      .insert({ name: file.name, path, size: file.size, mime_type: file.type || null, folder_id: folderId })
      .select()
      .single();
    if (dbErr || !data) {
      await es.storage.from(ES_BUCKET).remove([path]);
      errors.push(`${file.name} : ${dbErr?.message ?? "erreur"}`);
      continue;
    }
    created.push(data as EsFile);
  }
  onProgress?.(null);
  return { created, errors };
}

// ───────── Codes élèves ─────────

// Un code élève = 8 caractères (sans I, O, 0, 1) ; affiché « XXXX-XXXX »
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

// E-mail technique associé à un code (jamais affiché, aucun mail n'est envoyé)
export function studentEmail(code: string): string {
  return `${code.toLowerCase()}@eleve.local`;
}

export type CreatedStudent = { id: string; full_name: string; code: string };

// Appelle la fonction Edge « es-students » (réservée au prof)
export async function callStudents<T>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await getEs().functions.invoke("es-students", { body });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = await ctx.json();
        if (j && typeof j.error === "string") msg = j.error;
      } catch {
        // on garde le message par défaut
      }
    }
    return { data: null, error: msg };
  }
  if (data && typeof data.error === "string") return { data: null, error: data.error };
  return { data: data as T, error: null };
}

// ───────── Emploi du temps, appel, observations ─────────

// Créneau valable toutes les semaines, ou seulement les semaines Q1 / Q2 (alternance)
export type WeekKind = "all" | "q1" | "q2";

export type Slot = {
  id: string;
  class_id: string;
  weekday: number; // 1 = lundi … 7 = dimanche
  start_time: string; // « HH:MM:SS »
  end_time: string;
  room: string;
  subject: string;
  week: WeekKind;
};

export type Session = {
  id: string;
  class_id: string;
  slot_id: string | null;
  date: string; // « AAAA-MM-JJ »
  start_time: string;
  end_time: string;
  room: string;
  topic: string;
  validated_at: string | null;
};

export type AttStatus = "present" | "absent" | "late";

export const STATUS_LABEL: Record<AttStatus, string> = {
  present: "Présent",
  absent: "Absent",
  late: "Retard",
};

export type Attendance = {
  session_id: string;
  student_id: string;
  status: AttStatus;
  late_minutes: number | null;
  excused: boolean;
  reason: string;
  infirmary: boolean;
  excluded: boolean;
  exempt: boolean;
};

export type RemarkKind = "observation" | "encouragement" | "material" | "homework" | "behaviour" | "punishment";

export const REMARK_LABEL: Record<RemarkKind, string> = {
  observation: "Observation",
  encouragement: "Encouragement",
  material: "Oubli de matériel",
  homework: "Travail non fait",
  behaviour: "Comportement",
  punishment: "Punition",
};

export type Remark = {
  id: string;
  class_id: string;
  session_id: string | null;
  student_id: string;
  kind: RemarkKind;
  body: string;
  visible_to_student: boolean;
  created_at: string;
};

export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export const hhmm = (t: string) => t.slice(0, 5);

// Date locale → « AAAA-MM-JJ » (sans décalage de fuseau)
export function toYmd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function mondayOf(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (r.getDay() + 6) % 7; // lundi = 0
  r.setDate(r.getDate() - wd);
  return r;
}

export function formatDay(ymd: string): string {
  return fromYmd(ymd).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export function formatShortDay(ymd: string): string {
  return fromYmd(ymd).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

// Semaine Q1 ou Q2 : on part d'un lundi connu comme Q1, puis ça alterne chaque semaine
export function weekKindOf(monday: Date, q1Monday: string | null): "q1" | "q2" {
  if (!q1Monday) return "q1";
  const a = Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate());
  const ref = fromYmd(q1Monday);
  const b = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const weeks = Math.round((a - b) / (7 * 24 * 3600 * 1000));
  return Math.abs(weeks) % 2 === 0 ? "q1" : "q2";
}

export const WEEK_LABEL: Record<WeekKind, string> = { all: "Toutes les semaines", q1: "Q1", q2: "Q2" };

// Un cours choisi pour faire l'appel (créneau + date)
export type AppelTarget = {
  cls: ClassRow;
  date: string; // « AAAA-MM-JJ »
  start: string; // « HH:MM »
  end: string;
  room: string;
  slotId: string | null;
};

export const appelKey = (t: { cls: { id: string }; date: string; start: string }) => `${t.cls.id}|${t.date}|${t.start}`;
