-- Connexion des élèves par code : le prof crée les comptes (fonction Edge « es-students »),
-- l'élève tape seulement son code. Plus d'inscription par code de classe.

drop function if exists public.es_join_class(text);

-- Codes de connexion des élèves (lisibles par le prof uniquement ; écrits par la fonction Edge)
create table public.es_student_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
alter table public.es_student_codes enable row level security;

create function es_private.teacher_has_student(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.es_members m
    join public.es_classes c on c.id = m.class_id
    where m.student_id = s and c.teacher_id = (select auth.uid())
  );
$$;

create policy es_student_codes_teacher_select on public.es_student_codes for select to authenticated
  using (es_private.is_teacher() and es_private.teacher_has_student(user_id));

revoke all on public.es_student_codes from anon;
