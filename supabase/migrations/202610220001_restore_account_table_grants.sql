-- Phase 5 hotfix: restore account table grants.
--
-- 202610210001_pinned_tools_collections.sql used
--   revoke all on all tables in schema public from anon, authenticated;
-- following the style of 202609200001_platform.sql, but re-granted only the
-- three new tables. That removed the authenticated-role grants on every
-- pre-existing user-scoped table (profiles, favorites, recent_tools,
-- saved_workflows, saved_presets, usage_records, api_keys, subscriptions,
-- integration_connections, audit_logs, organizations, organization_members).
-- Because test and production share one Supabase project, every
-- /api/account endpoint started returning permission errors on both.
--
-- This migration restores exactly the grants 202609200001 created:
-- nothing new, no column widening, and nothing for the anon role.
-- Admin/analytics/override tables intentionally stay ungranted
-- (gateway-only, service role).
--
-- 2026-11-03 fix: the profiles INSERT grant now includes updated_at.
-- The account profile route upserts a row whose insert list always
-- contains updated_at, and Postgres requires INSERT privilege on every
-- column in the insert list — missing one column fails the whole upsert
-- with 42501 "permission denied for table profiles" even when the row
-- already exists.

begin;

grant select on public.profiles to authenticated;
grant insert(user_id, display_name, avatar_url, timezone, locale, theme, preferences, updated_at) on public.profiles to authenticated;
grant update(display_name, avatar_url, timezone, locale, theme, preferences, updated_at) on public.profiles to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert, update, delete on public.recent_tools, public.saved_workflows, public.saved_presets to authenticated;
grant select on public.usage_records, public.api_keys, public.subscriptions, public.integration_connections, public.audit_logs, public.organizations, public.organization_members to authenticated;

commit;
