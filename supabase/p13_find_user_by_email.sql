-- p13: resolve an email to a user id for team invites (service role only).
create or replace function public.find_user_by_email(p_email text)
returns uuid
language plpgsql
security definer set search_path = public
as $fn$
declare v_id uuid;
begin
  if p_email is null or length(trim(p_email)) = 0 then return null; end if;
  select u.id into v_id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  return v_id;
end;
$fn$;

revoke all on function public.find_user_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_by_email(text) to service_role;
