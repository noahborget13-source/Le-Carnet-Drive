-- Nouvelle catégorie de publication : « Travail à faire » (sans rendu)
alter table public.es_posts drop constraint es_posts_kind_check;
alter table public.es_posts add constraint es_posts_kind_check
  check (kind in ('resource', 'assignment', 'todo', 'announcement'));
