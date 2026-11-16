import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Client créé à la demande (côté navigateur uniquement) pour ne pas casser le build
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY manquantes."
      );
    }
    client = createClient(url, key);
  }
  return client;
}

export const BUCKET = "drive";

export type FileRow = {
  id: string;
  name: string;
  path: string;
  size: number;
  mime_type: string | null;
  created_at: string;
};
