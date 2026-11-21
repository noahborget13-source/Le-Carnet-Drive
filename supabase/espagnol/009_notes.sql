-- Notes façon Pronote : devoirs (évaluations) par classe et note de chaque élève
create table public.es_assessments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.es_classes(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  date date not null default current_date,
  scale numeric not null default 20 check (scale > 0 and scale <= 100),
  coef numeric not null default 1 check (coef >= 0 and coef <= 20),
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create index es_assessments_class_idx on public.es_assessments (class_id, date desc);

create table public.es_grades (
  assessment_id uuid not null references public.es_assessments(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  value numeric check (value >= 0),
  absent boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (assessment_id, student_id)
);
create index es_grades_student_idx on public.es_grades (student_id);

alter table public.es_assessments enable row level security;
alter table public.es_grades enable row level security;

create function es_private.owns_assessment(a uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.es_assessments x
    join public.es_classes c on c.id = x.class_id
    where x.id = a and c.teacher_id = (select auth.uid())
  );
$$;

create function es_private.assessment_has_student(a uuid, s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.es_assessments x
    join public.es_members m on m.class_id = x.class_id
    where x.id = a and m.student_id = s
  );
$$;

create function es_private.assessment_published_for_me(a uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.es_assessments x
    join public.es_members m on m.class_id = x.class_id
    where x.id = a and x.published and m.student_id = (select auth.uid())
  );
$$;

create policy es_assessments_teacher on public.es_assessments for all to authenticated
  using (es_private.owns_class(class_id)) with check (es_private.owns_class(class_id));
create policy es_assessments_student on public.es_assessments for select to authenticated
  using (published and es_private.is_member(class_id));

create policy es_grades_teacher on public.es_grades for all to authenticated
  using (es_private.owns_assessment(assessment_id))
  with check (es_private.owns_assessment(assessment_id) and es_private.assessment_has_student(assessment_id, student_id));
create policy es_grades_student on public.es_grades for select to authenticated
  using (student_id = (select auth.uid()) and es_private.assessment_published_for_me(assessment_id));

revoke all on public.es_assessments, public.es_grades from anon;
