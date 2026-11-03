-- Fix: profiles upsert (ON CONFLICT DO UPDATE) sets every payload column,
-- including the conflict key user_id, so UPDATE privilege on user_id is
-- required even though its value never changes. Idempotent.
begin;

grant update(user_id) on public.profiles to authenticated;

commit;
