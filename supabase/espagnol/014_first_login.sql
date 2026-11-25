-- Pastille « première connexion » (appliqué via apply_migration es_first_login)
alter table public.es_profiles add column first_login_at timestamptz;
update public.es_profiles set first_login_at = last_login_at where last_login_at is not null;
-- trigger es_private.set_first_login (before update) : first_login_at = last_login_at quand last_login_at passe de null à une valeur
-- es_private.reset_login_on_new_code remet aussi first_login_at à null
-- es_seen.area accepte aussi 'logins'
