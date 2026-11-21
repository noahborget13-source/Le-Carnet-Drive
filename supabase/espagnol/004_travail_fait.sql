-- L'élève peut cocher « fait » sur un « Travail à faire » ; le prof voit qui a fini
create table public.es_post_done (
  post_id uuid not null references public.es_posts(id) on delete cascade,
  student_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (post_id, student_id)
);
create index es_post_done_student_idx on public.es_post_done (student_id);
alter table public.es_post_done enable row level security;

create policy es_post_done_student_select on public.es_post_done for select to authenticated
  using (student_id = (select auth.uid()));
create policy es_post_done_student_insert on public.es_post_done for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and es_private.can_read_post(post_id)
    and exists (select 1 from public.es_posts p where p.id = post_id and p.kind = 'todo')
  );
create policy es_post_done_student_delete on public.es_post_done for delete to authenticated
  using (student_id = (select auth.uid()));
create policy es_post_done_teacher_select on public.es_post_done for select to authenticated
  using (es_private.owns_post(post_id));

revoke all on public.es_post_done from anon;
