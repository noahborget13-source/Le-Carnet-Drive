-- Pièces jointes dans la communication (appliqué via apply_migration es_message_files)
-- es_messages.body peut être vide (message avec seulement des fichiers)
create table public.es_message_files (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.es_messages(id) on delete cascade,
  name text not null, path text not null, size bigint not null default 0, mime_type text,
  created_at timestamptz not null default now()
);
-- RLS : le prof gère les fichiers des messages de ses classes ; l'élève lit ceux de ses messages/informations
--   et ajoute à ses propres messages. Stockage : msg/{uid}/… (écriture élève sur son dossier,
--   lecture via es_private.can_read_message_path ; le prof a déjà tous les droits sur le bucket).
