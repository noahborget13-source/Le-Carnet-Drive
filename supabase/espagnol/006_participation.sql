-- Participation orale pendant un cours (1 à 5 étoiles), saisie dans l'appel — visible du prof uniquement
create table public.es_participation (
  session_id uuid not null references public.es_sessions(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (session_id, student_id)
);
create index es_participation_student_idx on public.es_participation (student_id);
alter table public.es_participation enable row level security;

create policy es_participation_teacher on public.es_participation for all to authenticated
  using (es_private.owns_session(session_id))
  with check (es_private.owns_session(session_id) and es_private.session_has_student(session_id, student_id));

revoke all on public.es_participation from anon;
