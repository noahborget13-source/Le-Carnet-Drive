-- Table des fichiers
create table public.drive_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  path text not null unique,
  size bigint not null default 0,
  mime_type text,
  created_at timestamptz not null default now()
);

create index drive_files_user_id_created_at_idx on public.drive_files (user_id, created_at desc);

alter table public.drive_files enable row level security;

create policy "drive_files_select_own" on public.drive_files
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "drive_files_insert_own" on public.drive_files
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "drive_files_update_own" on public.drive_files
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "drive_files_delete_own" on public.drive_files
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Bucket privé (50 Mo max par fichier)
insert into storage.buckets (id, name, public, file_size_limit)
values ('drive', 'drive', false, 52428800)
on conflict (id) do nothing;

-- Chaque utilisateur n'accède qu'à son dossier {user_id}/...
create policy "drive_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'drive' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "drive_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'drive' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "drive_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'drive' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "drive_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'drive' and (storage.foldername(name))[1] = (select auth.uid())::text);
