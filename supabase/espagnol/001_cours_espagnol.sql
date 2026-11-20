-- Cours d'espagnol : classes, ressources, devoirs, rendus (rôles prof / élève)
-- À appliquer sur le projet Supabase « drive » (comptes séparés de Le Carnet).

create schema if not exists es_private;
grant usage on schema es_private to authenticated;

-- Adresses e-mail qui deviennent « prof » à l'inscription (aucun accès via l'API : RLS sans politique)
create table public.es_teachers (email text primary key);
alter table public.es_teachers enable row level security;
insert into public.es_teachers (email) values ('borgetn13@gmail.com') on conflict do nothing;

create table public.es_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  role text not null default 'student' check (role in ('teacher', 'student')),
  created_at timestamptz not null default now()
);

create table public.es_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  created_at timestamptz not null default now()
);

create table public.es_members (
  class_id uuid not null references public.es_classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table public.es_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid references public.es_folders(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.es_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id uuid references public.es_folders(id) on delete restrict,
  name text not null,
  path text not null unique,
  size bigint not null default 0,
  mime_type text,
  created_at timestamptz not null default now()
);

create table public.es_posts (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.es_classes(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('resource', 'assignment', 'announcement')),
  title text not null,
  body text not null default '',
  due_at timestamptz,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.es_post_files (
  post_id uuid not null references public.es_posts(id) on delete cascade,
  file_id uuid not null references public.es_files(id) on delete cascade,
  primary key (post_id, file_id)
);

create table public.es_submissions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.es_posts(id) on delete cascade,
  student_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null default '',
  submitted_at timestamptz not null default now(),
  grade text,
  feedback text,
  unique (post_id, student_id)
);

create table public.es_submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.es_submissions(id) on delete cascade,
  name text not null,
  path text not null unique,
  size bigint not null default 0,
  mime_type text,
  created_at timestamptz not null default now()
);

create index es_classes_teacher_idx on public.es_classes (teacher_id);
create index es_members_student_idx on public.es_members (student_id);
create index es_folders_owner_idx on public.es_folders (owner_id, parent_id);
create index es_files_owner_idx on public.es_files (owner_id, folder_id);
create index es_posts_class_idx on public.es_posts (class_id, created_at desc);
create index es_post_files_file_idx on public.es_post_files (file_id);
create index es_submissions_post_idx on public.es_submissions (post_id);
create index es_submissions_student_idx on public.es_submissions (student_id);
create index es_submission_files_sub_idx on public.es_submission_files (submission_id);

-- ───────── Fonctions d'aide (security definer, schéma non exposé par l'API) ─────────

create function es_private.is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.es_profiles where id = (select auth.uid()) and role = 'teacher');
$$;

create function es_private.owns_class(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.es_classes where id = c and teacher_id = (select auth.uid()));
$$;

create function es_private.is_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.es_members where class_id = c and student_id = (select auth.uid()));
$$;

create function es_private.owns_post(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.es_posts x
    join public.es_classes c on c.id = x.class_id
    where x.id = p and c.teacher_id = (select auth.uid())
  );
$$;

create function es_private.can_read_post(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.es_posts x
    where x.id = p and x.published and es_private.is_member(x.class_id)
  );
$$;

create function es_private.can_read_file(f uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.es_post_files pf
    join public.es_posts p on p.id = pf.post_id
    where pf.file_id = f and p.published and es_private.is_member(p.class_id)
  );
$$;

create function es_private.can_read_path(n text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.es_files f where f.path = n and es_private.can_read_file(f.id)
  );
$$;

create function es_private.owns_submission(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.es_submissions where id = s and student_id = (select auth.uid()));
$$;

create function es_private.teacher_reads_submission(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.es_submissions x where x.id = s and es_private.owns_post(x.post_id)
  );
$$;

-- ───────── Triggers ─────────

create function es_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.es_profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when exists (select 1 from public.es_teachers t where lower(t.email) = lower(new.email))
      then 'teacher' else 'student' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger es_on_auth_user_created
  after insert on auth.users
  for each row execute function es_private.handle_new_user();

-- Comptes déjà existants
insert into public.es_profiles (id, email, full_name, role)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  case when exists (select 1 from public.es_teachers t where lower(t.email) = lower(u.email))
    then 'teacher' else 'student' end
from auth.users u
on conflict (id) do nothing;

-- Un utilisateur ne peut pas changer son rôle ni son e-mail
create function es_private.protect_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    new.id := old.id;
    new.role := old.role;
    new.email := old.email;
  end if;
  return new;
end;
$$;

create trigger es_protect_profile
  before update on public.es_profiles
  for each row execute function es_private.protect_profile();

-- Seul le prof peut écrire la note et le commentaire
create function es_private.protect_submission() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not es_private.is_teacher() then
    if tg_op = 'INSERT' then
      new.grade := null;
      new.feedback := null;
    else
      new.grade := old.grade;
      new.feedback := old.feedback;
      new.post_id := old.post_id;
      new.student_id := old.student_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger es_protect_submission
  before insert or update on public.es_submissions
  for each row execute function es_private.protect_submission();

-- ───────── Rejoindre une classe avec un code ─────────

create function public.es_join_class(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion requise';
  end if;
  select id into c from public.es_classes where code = upper(trim(p_code));
  if c is null then
    raise exception 'Code de classe introuvable';
  end if;
  insert into public.es_members (class_id, student_id) values (c, (select auth.uid()))
  on conflict do nothing;
  return c;
end;
$$;

revoke execute on function public.es_join_class(text) from public, anon;
grant execute on function public.es_join_class(text) to authenticated;

-- ───────── Sécurité (RLS) ─────────

alter table public.es_profiles enable row level security;
alter table public.es_classes enable row level security;
alter table public.es_members enable row level security;
alter table public.es_folders enable row level security;
alter table public.es_files enable row level security;
alter table public.es_posts enable row level security;
alter table public.es_post_files enable row level security;
alter table public.es_submissions enable row level security;
alter table public.es_submission_files enable row level security;

create policy es_profiles_select on public.es_profiles for select to authenticated
  using (id = (select auth.uid()) or es_private.is_teacher());
create policy es_profiles_update on public.es_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy es_classes_teacher on public.es_classes for all to authenticated
  using (es_private.is_teacher() and teacher_id = (select auth.uid()))
  with check (es_private.is_teacher() and teacher_id = (select auth.uid()));
create policy es_classes_student_select on public.es_classes for select to authenticated
  using (es_private.is_member(id));

create policy es_members_teacher_select on public.es_members for select to authenticated
  using (es_private.owns_class(class_id));
create policy es_members_teacher_delete on public.es_members for delete to authenticated
  using (es_private.owns_class(class_id));
create policy es_members_student_select on public.es_members for select to authenticated
  using (student_id = (select auth.uid()));
create policy es_members_student_delete on public.es_members for delete to authenticated
  using (student_id = (select auth.uid()));

create policy es_folders_teacher on public.es_folders for all to authenticated
  using (es_private.is_teacher() and owner_id = (select auth.uid()))
  with check (es_private.is_teacher() and owner_id = (select auth.uid()));

create policy es_files_teacher on public.es_files for all to authenticated
  using (es_private.is_teacher() and owner_id = (select auth.uid()))
  with check (es_private.is_teacher() and owner_id = (select auth.uid()));
create policy es_files_student_select on public.es_files for select to authenticated
  using (es_private.can_read_file(id));

create policy es_posts_teacher on public.es_posts for all to authenticated
  using (es_private.owns_class(class_id))
  with check (es_private.owns_class(class_id) and author_id = (select auth.uid()));
create policy es_posts_student_select on public.es_posts for select to authenticated
  using (published and es_private.is_member(class_id));

create policy es_post_files_teacher on public.es_post_files for all to authenticated
  using (es_private.owns_post(post_id))
  with check (
    es_private.owns_post(post_id)
    and exists (select 1 from public.es_files f where f.id = file_id and f.owner_id = (select auth.uid()))
  );
create policy es_post_files_student_select on public.es_post_files for select to authenticated
  using (es_private.can_read_post(post_id));

create policy es_submissions_student_select on public.es_submissions for select to authenticated
  using (student_id = (select auth.uid()));
create policy es_submissions_student_insert on public.es_submissions for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and es_private.can_read_post(post_id)
    and exists (select 1 from public.es_posts p where p.id = post_id and p.kind = 'assignment')
  );
create policy es_submissions_student_update on public.es_submissions for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy es_submissions_student_delete on public.es_submissions for delete to authenticated
  using (student_id = (select auth.uid()));
create policy es_submissions_teacher_select on public.es_submissions for select to authenticated
  using (es_private.owns_post(post_id));
create policy es_submissions_teacher_update on public.es_submissions for update to authenticated
  using (es_private.owns_post(post_id)) with check (es_private.owns_post(post_id));

create policy es_submission_files_student on public.es_submission_files for all to authenticated
  using (es_private.owns_submission(submission_id))
  with check (es_private.owns_submission(submission_id));
create policy es_submission_files_teacher_select on public.es_submission_files for select to authenticated
  using (es_private.teacher_reads_submission(submission_id));

revoke all on public.es_teachers, public.es_profiles, public.es_classes, public.es_members,
  public.es_folders, public.es_files, public.es_posts, public.es_post_files,
  public.es_submissions, public.es_submission_files from anon;

-- ───────── Stockage : bucket privé (50 Mo max par fichier) ─────────
-- lib/{prof}/…  = bibliothèque du prof   |   sub/{élève}/{devoir}/…  = rendus des élèves

insert into storage.buckets (id, name, public, file_size_limit)
values ('espagnol', 'espagnol', false, 52428800)
on conflict (id) do nothing;

create policy es_storage_teacher_all on storage.objects for all to authenticated
  using (bucket_id = 'espagnol' and es_private.is_teacher())
  with check (bucket_id = 'espagnol' and es_private.is_teacher());

create policy es_storage_student_read_published on storage.objects for select to authenticated
  using (
    bucket_id = 'espagnol'
    and (storage.foldername(name))[1] = 'lib'
    and es_private.can_read_path(name)
  );

create policy es_storage_student_own_select on storage.objects for select to authenticated
  using (
    bucket_id = 'espagnol'
    and (storage.foldername(name))[1] = 'sub'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
create policy es_storage_student_own_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'espagnol'
    and (storage.foldername(name))[1] = 'sub'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
create policy es_storage_student_own_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'espagnol'
    and (storage.foldername(name))[1] = 'sub'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
