# DevUtils AI Context

## Project architecture
- Frontend: React, TypeScript, Vite, Tailwind CSS.
- Backend: Node.js / Express in `server/index.mjs`.
- Authentication and database: Supabase Auth + PostgreSQL through the Node.js gateway.
- Production process: systemd service `devutils`; reverse proxy: Nginx.
- Production application directory currently documented as `/opt/devutils/app`.
- Production environment file is outside the repository at `/etc/devutils/devutils.env`.

## Protected working behavior
- Preserve same-origin Supabase email confirmation and password recovery flows.
- Sessions are handled server-side using HttpOnly cookies; do not introduce client-side Supabase session persistence.
- Keep CSRF validation and origin validation enabled.
- Do not put service-role keys, database credentials, or other secrets in source files, browser bundles, docs, logs, or Git.
- Account data loading depends on stable user identity (`auth.user?.id`), not the full user object reference.
- Favorite subscriptions must share requests and cache only within the current user scope. Clear stale data when the user changes or signs out.
- Admin access is enforced in the backend. A hidden frontend route is not authorization.
- Tool overrides are metadata for registered tool implementations; the Admin UI must not execute arbitrary code entered by a user.

## Change protocol
1. Inspect current files before editing; do not assume old snippets match.
2. Make the smallest targeted change and preserve unrelated behavior.
3. Add or update tests for authentication, account loading, favorites, admin permissions, and database writes as applicable.
4. Run `npm run test:server`, `npm run test:favorites`, `npx tsx scripts/verify.ts`, `npx tsc --noEmit`, and `npm run build`.
5. Update `PROJECT_STATUS.md`, `UPDATE_MANIFEST.md`, and `CHANGELOG.md` truthfully.
6. Include exact relative paths for all added, modified, and deleted files.
7. List database migrations, API contract changes, environment changes, and dependency changes separately.
8. Do not claim production parity or passing checks unless they were verified.
9. Never overwrite Production automatically. Review diffs, back up files, stage the release, and deploy only after explicit approval.
