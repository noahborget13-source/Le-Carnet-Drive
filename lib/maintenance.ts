import { getSupabase } from "./supabase";

export type Maintenance = { id: number; message: string | null; maint_end: string | null };
export type Notice = { id: number; message: string; maint_start: string | null; maint_end: string | null };

// Maintenance en cours qui concerne le Drive (vue drive_maintenance_active, calculée avec l'heure de Supabase).
// En cas d'erreur (réseau, vue absente), on laisse le Drive accessible, comme Le Carnet.
export async function fetchMaintenance(): Promise<Maintenance | null> {
  try {
    const { data, error } = await getSupabase()
      .from("drive_maintenance_active")
      .select("id,message,maint_end")
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0] as Maintenance;
  } catch {
    return null;
  }
}

// Bandeau d'avertissement : maintenance (en cours ou programmée) qui concerne le Drive et dont
// le message doit déjà être affiché.
export async function fetchNotice(): Promise<Notice | null> {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await getSupabase()
      .from("system_alerts")
      .select("id,message,maint_start,maint_end")
      .eq("is_maintenance", true)
      .eq("applies_to_drive", true)
      .not("message", "is", null)
      .lte("display_at", nowIso)
      .gt("maint_end", nowIso)
      .order("maint_start", { ascending: true })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const row = data[0] as Notice;
    return row.message && row.message.trim() ? row : null;
  } catch {
    return null;
  }
}
