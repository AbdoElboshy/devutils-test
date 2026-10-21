-- Keep the existing user/account audit actions and allow the admin tools
-- management actions emitted by server/index.mjs. This is a forward migration:
-- do not rewrite an already-applied migration in production.
begin;

alter table public.audit_logs
  drop constraint if exists audit_logs_action_check;

alter table public.audit_logs
  add constraint audit_logs_action_check
  check (action in (
    'logged_in',
    'profile_updated',
    'password_changed',
    'api_key_created',
    'api_key_revoked',
    'workflow_created',
    'integration_connected',
    'integration_disconnected',
    'account_deleted',
    'tool_config_changed',
    'tool_visibility_changed'
  ));

commit;
