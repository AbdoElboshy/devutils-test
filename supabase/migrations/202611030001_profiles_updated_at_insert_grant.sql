-- Fix: profiles upsert (ON CONFLICT DO UPDATE) requires INSERT privilege
-- on every column in the insert list. The account profile route always
-- sends updated_at, so the missing column-level INSERT grant made every
-- profile save fail with 42501 "permission denied for table profiles".
--
-- This migration is a no-op on databases that already have the grant:
-- re-granting an existing privilege is idempotent in Postgres.

begin;

grant insert(user_id, display_name, avatar_url, timezone, locale, theme, preferences, updated_at)
  on public.profiles to authenticated;

commit;
