-- Ressources partagées avec les élèves (appliqué via apply_migration)
create table public.es_file_shares (
  file_id uuid not null references public.es_files(id) on delete cascade,
  class_id uuid not null references public.es_classes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (file_id, class_id)
);
-- + RLS : le prof gère les partages de ses classes et de ses fichiers ; les élèves lisent ceux de leurs classes
-- + es_private.can_read_file() accepte aussi un fichier partagé avec une classe de l'élève
