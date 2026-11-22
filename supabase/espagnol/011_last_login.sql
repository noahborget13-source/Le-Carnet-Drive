-- Pastille verte/rouge : l'élève a-t-il déjà tapé son code ? (appliqué via apply_migration)
alter table public.es_profiles add column last_login_at timestamptz;
-- trigger es_private.reset_login_on_new_code : un nouveau code remet last_login_at à null
