# DevUtils Account Backend

Production accounts use the same-origin Node gateway in `server/index.mjs`, Supabase Auth, and Supabase PostgreSQL with Row Level Security.

The browser never receives the service-role key and does not store access or refresh tokens in local storage. The gateway stores sessions in Secure, HttpOnly, SameSite cookies, enforces CSRF/origin checks, and proxies account data through user-scoped Supabase clients.

Follow `INSTALL.md` for complete setup. Important files:

- `supabase/migrations/202609200001_platform.sql`: schema, grants, RLS, usage, and audit functions.
- `supabase/tests/platform_rls_test.sql`: RLS/grant smoke tests.
- `.env.example`: server-only production variables.
- `deploy/systemd/devutils.service`: production process service.
- `deploy/nginx/devutils.conf`: reverse proxy with confirmation-token-hash log suppression.

Supabase custom SMTP and email templates are configured in the Supabase dashboard. SMTP credentials do not belong in the EC2 environment for this architecture.