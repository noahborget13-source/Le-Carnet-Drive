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
  last_login_at?: string | null; // première connexion avec le code, null = jamais
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
  session_id: string | null; // cours où la publication est donnée
  due_session_id: string | null; // cours pour lequel le travail est attendu
  given: SessionLite | null;
  due: SessionLite | null;
  es_post_files: { es_files: EsFile | null }[];
};

export type SessionLite = { date: string; start_time: string; end_time: string; room: string };

// Sélection d'une publication avec ses fichiers et ses deux cours
export const POST_SELECT =
  "*, es_post_files(es_files(*)), given:es_sessions!session_id(date,start_time,end_time,room), due:es_sessions!due_session_id(date,start_time,end_time,room)";

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

// ───────── Cours (créneau + date) pour rattacher les publications ─────────

export type Lesson = { key: string; date: string; start: string; end: string; room: string; slotId: string };

// Les cours d'une classe entre deux dates, d'après l'emploi du temps (semaines Q1 / Q2 comprises)
export function lessonsFor(slots: Slot[], classId: string, q1Monday: string | null, from: Date, to: Date): Lesson[] {
  const out: Lesson[] = [];
  for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d <= to; d = addDays(d, 1)) {
    const wd = ((d.getDay() + 6) % 7) + 1;
    const kind = weekKindOf(mondayOf(d), q1Monday);
    for (const s of slots) {
      if (s.class_id !== classId || s.weekday !== wd || !(s.week === "all" || s.week === kind)) continue;
      const date = toYmd(d);
      out.push({ key: `${date}T${hhmm(s.start_time)}`, date, start: hhmm(s.start_time), end: hhmm(s.end_time), room: s.room, slotId: s.id });
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function lessonLabel(l: { date: string; start: string; end?: string; room?: string }): string {
  return `${formatShortDay(l.date)} · ${l.start}${l.end ? `–${l.end}` : ""}${l.room ? ` · salle ${l.room}` : ""}`;
}

export function sessionLabel(s: SessionLite): string {
  return lessonLabel({ date: s.date, start: hhmm(s.start_time), end: hhmm(s.end_time), room: s.room });
}

// Date + heure de début d'un cours → ISO (heure locale)
export function lessonStartIso(l: { date: string; start: string }): string {
  return new Date(`${l.date}T${l.start}:00`).toISOString();
}

// Retrouve (ou crée) l'enregistrement du cours, utilisé aussi pour l'appel
export async function ensureLessonSession(classId: string, l: Lesson): Promise<string | null> {
  const es = getEs();
  const find = () =>
    es.from("es_sessions").select("id").eq("class_id", classId).eq("date", l.date).eq("start_time", `${l.start}:00`).maybeSingle();
  const found = await find();
  if (found.data) return (found.data as { id: string }).id;
  const ins = await es
    .from("es_sessions")
    .insert({ class_id: classId, date: l.date, start_time: l.start, end_time: l.end, room: l.room, slot_id: l.slotId || null })
    .select("id")
    .single();
  if (ins.data) return (ins.data as { id: string }).id;
  const again = await find();
  return (again.data as { id: string } | null)?.id ?? null;
}

// Clé de tri d'une publication : le cours où elle est donnée, sinon sa date de création
export function postSortKey(p: Post): string {
  return p.given ? `${p.given.date}T${hhmm(p.given.start_time)}` : p.created_at;
}

// ───────── Notes ─────────
export type Assessment = { id: string; class_id: string; title: string; date: string; scale: number; coef: number; published: boolean };
export type Grade = { assessment_id: string; student_id: string; value: number | null; absent: boolean };

// Moyenne pondérée ramenée sur 20 (les absents et les notes vides sont ignorés)
export function weightedAverage(items: { value: number | null; absent: boolean; scale: number; coef: number }[]): number | null {
  let sum = 0;
  let coefs = 0;
  for (const i of items) {
    if (i.absent || i.value === null || i.coef <= 0) continue;
    sum += (i.value / i.scale) * 20 * i.coef;
    coefs += i.coef;
  }
  return coefs > 0 ? sum / coefs : null;
}

export const fmtNote = (n: number | null) => (n === null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

// ───────── Compétences, bulletins, messagerie ─────────
export type Competency = { id: string; class_id: string; title: string };
export type CompetencyMark = { competency_id: string; student_id: string; level: number };
export const LEVELS: { n: number; label: string; short: string }[] = [
  { n: 1, label: "Maîtrise insuffisante", short: "MI" },
  { n: 2, label: "Maîtrise fragile", short: "MF" },
  { n: 3, label: "Maîtrise satisfaisante", short: "MS" },
  { n: 4, label: "Très bonne maîtrise", short: "TBM" },
];
export type Period = "T1" | "T2" | "T3";
export const PERIODS: Period[] = ["T1", "T2", "T3"];
export const PERIOD_LABEL: Record<Period, string> = { T1: "Trimestre 1", T2: "Trimestre 2", T3: "Trimestre 3" };
export type Report = { class_id: string; student_id: string; period: Period; comment: string; published: boolean };
export type MessageFile = { id: string; message_id: string; name: string; path: string; size: number; mime_type: string | null };
export type Message = { id: string; class_id: string; student_id: string | null; sender_id: string; body: string; created_at: string; es_message_files?: MessageFile[] };
export const MESSAGE_SELECT = "*, es_message_files(*)";

// Envoie un message (texte et/ou pièces jointes). Renvoie un message d'erreur éventuel.
export async function sendMessage(
  m: { class_id: string; student_id: string | null; sender_id?: string; body: string },
  files: File[]
): Promise<string | null> {
  const es = getEs();
  const row: Record<string, unknown> = { class_id: m.class_id, student_id: m.student_id, body: m.body.trim() };
  if (m.sender_id) row.sender_id = m.sender_id;
  const ins = await es.from("es_messages").insert(row).select("id, sender_id").single();
  if (ins.error || !ins.data) return ins.error?.message ?? "Envoi impossible.";
  const errors: string[] = [];
  for (const file of files) {
    if (file.size > MAX_SIZE) {
      errors.push(`${file.name} dépasse la limite de 50 Mo.`);
      continue;
    }
    const path = `msg/${ins.data.sender_id}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const up = await es.storage
      .from(ES_BUCKET)
      .upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (up.error) {
      errors.push(`${file.name} : ${up.error.message}`);
      continue;
    }
    const f = await es.from("es_message_files").insert({
      message_id: ins.data.id,
      name: file.name,
      path,
      size: file.size,
      mime_type: file.type || null,
    });
    if (f.error) {
      await es.storage.from(ES_BUCKET).remove([path]);
      errors.push(`${file.name} : ${f.error.message}`);
    }
  }
  return errors.length ? errors.join(" · ") : null;
}

export async function deleteMessage(m: Message): Promise<string | null> {
  const es = getEs();
  const paths = (m.es_message_files ?? []).map((f) => f.path);
  if (paths.length) await es.storage.from(ES_BUCKET).remove(paths);
  const { error } = await es.from("es_messages").delete().eq("id", m.id);
  return error?.message ?? null;
}

// Bornes approximatives des trimestres de l'année scolaire en cours
export function periodRange(p: Period, today = new Date()): { from: string; to: string } {
  const y = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  if (p === "T1") return { from: `${y}-08-15`, to: `${y}-11-30` };
  if (p === "T2") return { from: `${y}-12-01`, to: `${y + 1}-02-28` };
  return { from: `${y + 1}-03-01`, to: `${y + 1}-07-15` };
}
