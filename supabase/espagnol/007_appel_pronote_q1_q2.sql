-- Appel façon Pronote (cases à cocher), semaines Q1 / Q2 pour l'emploi du temps

alter table public.es_slots
  add column week text not null default 'all' check (week in ('all', 'q1', 'q2'));

alter table public.es_sessions
  add column validated_at timestamptz;

alter table public.es_attendance
  add column infirmary boolean not null default false,
  add column excluded boolean not null default false,
  add column exempt boolean not null default false;

-- Semaines Q1 / Q2 : on retient un lundi de semaine « Q1 », les autres semaines alternent
create table public.es_settings (
  teacher_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  q1_monday date not null,
  updated_at timestamptz not null default now()
);
alter table public.es_settings enable row level security;

create policy es_settings_select on public.es_settings for select to authenticated using (true);
create policy es_settings_teacher_insert on public.es_settings for insert to authenticated
  with check (es_private.is_teacher() and teacher_id = (select auth.uid()));
create policy es_settings_teacher_update on public.es_settings for update to authenticated
  using (es_private.is_teacher() and teacher_id = (select auth.uid()))
  with check (es_private.is_teacher() and teacher_id = (select auth.uid()));
create policy es_settings_teacher_delete on public.es_settings for delete to authenticated
  using (es_private.is_teacher() and teacher_id = (select auth.uid()));

revoke all on public.es_settings from anon;
