-- Cahier de textes : une publication est rattachée au cours où elle est donnée,
-- et un travail à faire / à rendre au cours pour lequel il est attendu
alter table public.es_posts
  add column session_id uuid references public.es_sessions(id) on delete set null,
  add column due_session_id uuid references public.es_sessions(id) on delete set null;

create index es_posts_session_idx on public.es_posts (session_id);
create index es_posts_due_session_idx on public.es_posts (due_session_id);

create function es_private.session_in_class(s uuid, c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.es_sessions where id = s and class_id = c);
$$;

drop policy es_posts_teacher on public.es_posts;
create policy es_posts_teacher on public.es_posts for all to authenticated
  using (es_private.owns_class(class_id))
  with check (
    es_private.owns_class(class_id)
    and author_id = (select auth.uid())
    and (session_id is null or es_private.session_in_class(session_id, class_id))
    and (due_session_id is null or es_private.session_in_class(due_session_id, class_id))
  );
