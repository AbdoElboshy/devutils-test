BEGIN;

-- DevUtils Phase 6 follow-up: revoke_admin() was called by the WS B gateway
-- (DELETE /api/admin/users/:id/role) but never defined by any migration.
create or replace function public.revoke_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null then raise exception 'p_user_id is required'; end if;
  update public.admin_users
    set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;
end;
$$;

revoke all on function public.revoke_admin(uuid) from public, anon, authenticated;
grant execute on function public.revoke_admin(uuid) to service_role;

COMMIT;
