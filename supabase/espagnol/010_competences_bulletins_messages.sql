-- Compétences, bulletins (appréciations) et messagerie / informations (appliqué via apply_migration)
create table public.es_competencies (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.es_classes(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now()
);
create table public.es_competency_marks (
  competency_id uuid not null references public.es_competencies(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  level smallint not null check (level between 1 and 4),
  updated_at timestamptz not null default now(),
  primary key (competency_id, student_id)
);
create table public.es_reports (
  class_id uuid not null references public.es_classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  period text not null check (period in ('T1','T2','T3')),
  comment text not null default '' check (char_length(comment) <= 2000),
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (class_id, student_id, period)
);
create table public.es_messages (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.es_classes(id) on delete cascade,
  student_id uuid references auth.users(id) on delete cascade, -- null = information à toute la classe
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
-- + index, fonctions es_private.owns_competency / competency_has_student et politiques RLS :
--   professeur : tout sur sa classe ; élève : lecture de ses compétences, de ses bulletins publiés,
--   des informations de sa classe et de sa conversation, écriture de messages à son prof uniquement.
