-- Dernière consultation par zone, pour les pastilles de notification (appliqué via apply_migration)
create table public.es_seen (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  area text not null check (area in ('work','resources','messages')),
  seen_at timestamptz not null default now(),
  primary key (user_id, area)
);
alter table public.es_seen enable row level security;
-- policies : select / insert / update sur ses propres lignes (user_id = auth.uid()) ; anon révoqué
