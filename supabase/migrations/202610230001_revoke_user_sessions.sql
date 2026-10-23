-- Phase 6: revoke a user's sessions server-side.
-- GoTrue has no admin sign-out-by-user-id API; the gateway calls this
-- security-definer function with the service-role key instead.
create or replace function public.revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'auth' and table_name = 'sessions') then
    execute 'delete from auth.sessions where user_id = $1' using p_user_id;
  end if;
  delete from auth.refresh_tokens where user_id = p_user_id and revoked = false;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
