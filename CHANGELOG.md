# Changelog

All notable changes to DevUtils are recorded here. This file is append-only;
existing history is never rewritten.

## [2026-10-19] Arena repair, authentication parity, Tools Management, Admin platform

Branch: `feature/repair-tools-admin`
Base commit: `4233b469dad3de746fb0b53a71a0630ec8ba8c7d` (tag `pre-repair-baseline`)

### ADDED

- `server/lib.mjs` — Dependency-free, side-effect-free gateway helpers: startup
  config validation, origin allowlist, CSRF double-submit validation, upstream
  error mapping, persistence sanitisation, Tools Management validation and
  registry merge, analytics allowlist, and redirect safety. Extracted so the
  security-critical logic is unit-testable without a database or network.
- `src/pages/admin.tsx` — Administrator dashboard: Overview, Tools Management,
  Category Management, Analytics, Audit log, and Health. Renders only real data;
  unauthorized users see an explicit denial, never an editable UI.
- `src/platform/admin-api.ts` — Typed admin API client (registry, overrides,
  reorder, categories, import/export, analytics, audit, health). Same-origin,
  cookie-authenticated, CSRF-protected via `apiFetch`.
- `src/lib/analytics.ts` — Privacy-conscious analytics client. Allowlisted event
  names and short identifiers only; off by default for anonymous visitors; never
  sends tool input, tokens, or payloads.
- `supabase/migrations/202610190002_tools_admin_analytics.sql` — Adds
  `admin_users`, `tool_overrides`, `category_overrides`, `analytics_events` with
  RLS, least-privilege grants, retention helper, and service-role-only
  `grant_admin`/`revoke_admin` bootstrap functions. Affects database structure.
- `registry.generated.json` — Base tool/category catalogue generated from
  `src/lib/registry.ts`, read by the gateway at startup and merged with admin
  overrides. Regenerate with `npx tsx scripts/generate-registry.ts`.
- `scripts/generate-registry.ts` — Emits `registry.generated.json` from the single
  code-level registry source of truth.
- `scripts/test-server.mjs` — 68 unit tests for `server/lib.mjs` covering config
  validation, origin/CSRF/redirect safety, tool/category/import validation,
  registry merge, persistence sanitisation, and the analytics allowlist.
- `docs/TOOLS_MANAGEMENT.md` — How the registry, overrides, permissions, and
  admin workflow fit together, and how to add a tool or category in code.
- `docs/IMPLEMENTATION_REPORT.md` — Problems found, root causes, fixes, tests,
  and outstanding limitations for this change set.
- `docs/GIT_AND_ROLLBACK.md` — Backup reference, review commands, deployment
  steps, and two distinct recovery procedures.

### UPDATED

- `server/index.mjs` — **Authentication and reliability fixes (see report):**
  routed every Supabase client through one factory that supplies the `ws`
  WebSocket transport (Node 20 has no global WebSocket, which previously crashed
  the process at startup); origin check now also accepts requests whose `Origin`
  host matches the request `Host` plus an optional `ALLOWED_ORIGINS` list (login
  previously 403'd when reached by IP or alternate hostname); CSRF check rejects
  missing tokens (previously two absent values compared equal and bypassed the
  check); upstream errors now map to 502/500 instead of always 400; added
  `/api/auth/me` rate limiting; confirmation redirects pass through
  `safeNextRoute`; added Tools Management, analytics, and admin endpoints. Affects
  authentication and deployment.
- `src/lib/registry.ts` — Added `tags` to the `Tool` type and a runtime overlay
  layer (`applyRegistryOverlays`, `resetRegistry`, `subscribeRegistry`,
  `loadRegistryOverlays`) that mutates the canonical `TOOLS`/`CATEGORIES`/
  `TOOL_MAP`/`ROUTE_MAP` in place so search, home, categories, routing,
  breadcrumbs, and the sitemap all read one merged source. Affects tool routing.
- `src/App.tsx` — Loads and subscribes to registry overlays at startup; added
  `/admin` and `/admin/*` routes; consumes `?auth_next=`/`?auth_error=` exactly
  once via `history.replaceState` so a reload can no longer pin the user to the
  verification screen; added admin title metadata.
- `src/components/chrome.tsx` — Account menu shows an Admin link only after the
  gateway confirms the role (convenience only; authorization stays server-side);
  emits `search_used` analytics on palette selection and on no-result searches.
- `src/components/ui.tsx` — `ToolScaffold` emits a `tool_opened` analytics event
  alongside existing recent-tool tracking.
- `src/pages/account.tsx` — Added an unverified-email banner with resend;
  password change now routes to `/login` because the gateway revokes all sessions
  after a password update; the change-password button is disabled while pending.
- `src/pages/auth.tsx` — Reads the `auth_error` signal from `sessionStorage`
  (set once by `App.tsx`) instead of a persistent URL query parameter.
- `scripts/verify.ts` — Added registry-overlay tests (rename, reorder, draft
  hiding, slug rewrite, unknown-id rejection, category overlay, reset) and made
  the JSON Patch assertion order-insensitive (RFC 6902 `replace` legitimately
  reorders keys). 155 assertions.
- `package.json` — Added the `ws` runtime dependency required by the gateway on
  Node 20. No scripts were added (project policy: `package.json` scripts are not
  hand-edited here); all commands are documented instead.
- `.env.example` — Rewritten to document exactly the seven variables the code
  reads (`NODE_ENV`, `APP_URL`, `PORT`, `ALLOWED_ORIGINS`, `SUPABASE_URL`,
  `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), with required vs
  optional marked and the SMTP-in-Supabase rationale explained. No invented
  variables.
- `public/sitemap.xml` — Regenerated from the merged registry (117 routes).

### DELETED

- `src/lib/registry-store.ts` — Removed before it shipped. It duplicated the
  registry as a parallel `RuntimeTool[]`; the overlay layer in `registry.ts`
  supersedes it and keeps a single source of truth. No references remained.
- `src/platform/supabase.ts`, `src/platform/supabase-repositories.ts` — Removed
  earlier in this branch. The browser-direct Supabase adapter stored session
  tokens in web storage, which the HttpOnly-cookie gateway replaces. All account
  data now flows through `src/platform/http-repositories.ts`.
- `supabase/functions/*` (api-keys, delete-account, api-v1, integrations,
  `_shared/*`, `deno.json`) — Removed earlier in this branch. Their behaviour now
  lives in the Node gateway, so there is one server runtime to deploy and secure
  rather than two.

### RENAMED

- None.

### DATABASE AND CONFIGURATION

- Migrations required: **yes** —
  `supabase/migrations/202610190002_tools_admin_analytics.sql` (after the
  existing `202609200001_platform.sql`).
- New environment variables: `ALLOWED_ORIGINS` (optional, empty by default).
- Changed environment variables: none renamed; `.env.example` now documents the
  real set and drops the unused `VITE_*` names (the browser reads no env vars).
- New runtime dependency: `ws` (required for Supabase realtime transport on
  Node 20). Run `npm ci` after pulling.
- Configuration required on the server: apply migration 0002, then bootstrap the
  first administrator with `select public.grant_admin('<user-uuid>');` (run in the
  Supabase SQL editor; there is no client-side promotion path).
- Backup requirements: back up the Supabase project before applying migration
  0002. The migration is additive (new tables, indexes, functions) and does not
  alter or drop existing user data.

### TESTS

- Commands executed:
  - `node scripts/test-server.mjs` — 68 passed, 0 failed.
  - `npx tsx scripts/verify.ts` — 155 passed, 0 failed.
  - `npx tsc --noEmit` — clean.
  - `npm run build` — success (909.45 kB, 267.76 kB gzip).
  - `node --check server/index.mjs && node --check server/lib.mjs` — clean.
  - Manual gateway smoke test on Node 20: startup, `/api/health` (503 degraded
    with an unreachable DB), `/runtime-config.js`, `/api/tools/registry`
    (103 tools, degraded flag), homepage CSP nonces, `/api/auth/me`, admin 401
    without a session, CSRF 403 on missing/mismatched tokens, cross-origin 403,
    404 JSON for unknown API routes.
- Results: all of the above pass.
- Known failures: none. End-to-end signup/login/reset email delivery could not be
  exercised here because it requires a provisioned Supabase project and SMTP
  credentials; those paths are code-complete and unit/smoke-tested up to the
  provider boundary. See `docs/IMPLEMENTATION_REPORT.md`.


## 2026-10-20 — Release candidate hardening (not yet deployed)

- Restored Account loading stability by depending on the stable user ID and removed a redundant refresh/reload sequence.
- Restored request deduplication and user-scoped caching for Favorites, including source subscription fan-out and stale-result protection.
- Admin authorization now selects `revoked_at` and checks the active admin record explicitly.
- Added a forward Supabase migration to allow the tool-management audit action values while preserving existing values.
- Reorder/import use checked bulk writes; registry import now validates and imports category overrides as well as tool overrides. Long-description fields now map to the actual database column, and unknown category IDs and duplicate import slugs are rejected. The Admin health guidance names both migrations.
- Admin mutations report a clear post-write audit failure instead of silently claiming full success.
- Added regression tests and the AI/project status/manifest documentation.
- This candidate has not been deployed and still requires dependency installation, full TypeScript/build verification, and Supabase staging checks.
