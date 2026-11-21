-- Emploi du temps du prof, appel (présent / absent / retard) et observations, façon Pronote

create table public.es_slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.es_classes(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- 1 = lundi … 7 = dimanche
  start_time time not null,
  end_time time not null,
  room text not null default '',
  subject text not null default 'Espagnol',
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

-- Un « appel » = un cours donné à une date précise
create table public.es_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.es_classes(id) on delete cascade,
  slot_id uuid references public.es_slots(id) on delete set null,
  date date not null,
  start_time time not null,
  end_time time not null,
  room text not null default '',
  topic text not null default '',
  created_at timestamptz not null default now(),
  unique (class_id, date, start_time)
);

create table public.es_attendance (
  session_id uuid not null references public.es_sessions(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('present', 'absent', 'late')),
  late_minutes int check (late_minutes is null or late_minutes between 1 and 600),
  excused boolean not null default false,
  reason text not null default '',
  updated_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

create table public.es_remarks (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.es_classes(id) on delete cascade,
  session_id uuid references public.es_sessions(id) on delete set null,
  student_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('observation', 'encouragement', 'material', 'homework', 'behaviour', 'punishment')),
  body text not null,
  visible_to_student boolean not null default true,
  created_at timestamptz not null default now()
);

create index es_slots_class_idx on public.es_slots (class_id, weekday, start_time);
create index es_sessions_class_idx on public.es_sessions (class_id, date);
create index es_sessions_slot_idx on public.es_sessions (slot_id);
create index es_attendance_student_idx on public.es_attendance (student_id);
create index es_remarks_class_idx on public.es_remarks (class_id, created_at desc);
create index es_remarks_student_idx on public.es_remarks (student_id);
create index es_remarks_session_idx on public.es_remarks (session_id);

create function es_private.owns_session(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.es_sessions x
    join public.es_classes c on c.id = x.class_id
    where x.id = s and c.teacher_id = (select auth.uid())
  );
$$;

create function es_private.class_has_student(c uuid, s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.es_members where class_id = c and student_id = s);
$$;

create function es_private.session_has_student(sess uuid, s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.es_sessions x
    join public.es_members m on m.class_id = x.class_id
    where x.id = sess and m.student_id = s
  );
$$;

alter table public.es_slots enable row level security;
alter table public.es_sessions enable row level security;
alter table public.es_attendance enable row level security;
alter table public.es_remarks enable row level security;

create policy es_slots_teacher on public.es_slots for all to authenticated
  using (es_private.owns_class(class_id)) with check (es_private.owns_class(class_id));
create policy es_slots_student_select on public.es_slots for select to authenticated
  using (es_private.is_member(class_id));

create policy es_sessions_teacher on public.es_sessions for all to authenticated
  using (es_private.owns_class(class_id)) with check (es_private.owns_class(class_id));
create policy es_sessions_student_select on public.es_sessions for select to authenticated
  using (es_private.is_member(class_id));

create policy es_attendance_teacher on public.es_attendance for all to authenticated
  using (es_private.owns_session(session_id))
  with check (es_private.owns_session(session_id) and es_private.session_has_student(session_id, student_id));
create policy es_attendance_student_select on public.es_attendance for select to authenticated
  using (student_id = (select auth.uid()));

create policy es_remarks_teacher on public.es_remarks for all to authenticated
  using (es_private.owns_class(class_id))
  with check (
    es_private.owns_class(class_id)
    and es_private.class_has_student(class_id, student_id)
    and (session_id is null or es_private.owns_session(session_id))
  );
create policy es_remarks_student_select on public.es_remarks for select to authenticated
  using (student_id = (select auth.uid()) and visible_to_student);

revoke all on public.es_slots, public.es_sessions, public.es_attendance, public.es_remarks from anon;
