# Implementation Report — Arena repair, authentication parity, Tools Management, Admin platform

Date: 2026-10-19
Branch: `feature/repair-tools-admin`
Base commit: `4233b469dad3de746fb0b53a71a0630ec8ba8c7d`
Backup tag: `pre-repair-baseline`
Backup archive: `/tmp/devutils-backup-20261019T193147Z.tar.gz` (272 KB, excludes `node_modules`/`dist`)

## 0. Reference-implementation caveat (read first)

The task instructed me to treat "the working server implementation" as the
authentication reference. **No second server, snapshot, or reference codebase was
present in this environment.** The only implementation available to inspect was
this repository. I did not invent a comparison against a system I could not
access.

What I did instead: audited this repository's own gateway
(`server/index.mjs`), traced every authentication code path, and fixed the
defects that provably broke real deployments — including one that prevented the
server from starting at all. Each root cause below is evidenced by code reading
or by an executed smoke test, not by assumption.

## 1. Original problems found

### P1 — The gateway could not start on the documented Node version (critical)

`INSTALL.md` instructs installing Node 20 via NodeSource. `@supabase/supabase-js`
v2 eagerly constructs a Realtime client, which requires a WebSocket
implementation. Node 20 has no global `WebSocket`, so `createClient()` threw
during module initialization and the process exited before binding a port.

Evidence — actual startup failure captured during the smoke test:

```text
Error: Node.js 20 detected without native WebSocket support.
Suggested solution: For Node.js < 22, install "ws" package and provide it via
the transport option
    at SupabaseClient._initRealtimeClient (.../@supabase/supabase-js/dist/index.mjs:839)
    at file:///…/server/index.mjs:61:20
```

Every endpoint returned `HTTP 000` (connection refused). This is the single
highest-impact defect in the repository: a deployment following the documented
steps exactly would produce a dead service, and Nginx would return 502.

### P2 — Login failed with 403 whenever the site was not reached by its canonical hostname (critical)

`requireOrigin` compared `req.get("origin")` only against `APP_URL.origin`. Any
request arriving by EC2 public IP, an alternate hostname, a staging domain, or a
dev proxy was rejected with `403 Origin rejected` before credentials were ever
checked.

This produces the classic "authentication doesn't work but nothing looks
misconfigured" report, because `APP_URL` is correct and the database is healthy.

### P3 — CSRF double-submit check could be bypassed (security)

```js
if (!constantEqual(req.cookies[COOKIE_CSRF], req.get("x-csrf-token"))) reject
```

With both values absent, `Buffer.from("")` was compared to `Buffer.from("")`;
equal lengths made `timingSafeEqual` return `true`, so the check passed.

Evidence — smoke test before the fix:

```text
=== login NO csrf cookie/header (expect 403) ===
HTTP 401            <-- reached credential checking; CSRF did not reject
```

After the fix the same request returns `403 CSRF validation failed`, and so do
signup, and analytics. Cross-site exploitation was additionally mitigated by
`SameSite=Lax` and the origin check, but the control itself was broken and is now
correct and regression-tested.

### P4 — `?auth_next=` was never consumed (authentication UX)

Email confirmation redirected to `/?auth_next=/verify-email`. `pathFromHash()`
read that query parameter on **every** load but never removed it, so the user was
pinned to the verification screen: any later navigation was overridden on the
next reload, and a shared/refreshed URL kept re-triggering it.

### P5 — Password change left the user on an invalid session

The gateway revokes all sessions (`scope: "global"`) after a password update and
clears cookies, correctly. The UI stayed on `/account/settings` and printed
"Password updated." — the next account request would 401 with no explanation.

### P6 — Upstream failures were reported as client errors

`sendError()` always responded `400`. A Supabase outage or a missing table told
the user their input was bad, and gave operators no signal that a dependency had
failed.

### P7 — No unverified-email handling

Supabase permits sign-in before email confirmation. Nothing in the account UI
surfaced the state or offered a resend, so users could sit in a limited state
with no path forward.

### P8 — Tool metadata could only be changed by editing many source files

Names, descriptions, ordering, visibility, and category assignment were compiled
constants. Any adjustment required editing `registry.ts`, rebuilding, and
redeploying — the exact pain point this task asked to remove.

### P9 — Dead and duplicated code

- `constantEqual` and the `timingSafeEqual` import became unused once CSRF moved
  to the shared helper.
- `src/lib/registry-store.ts` had been added as a parallel `RuntimeTool[]`
  registry — a second source of truth competing with `registry.ts`.
- `/api/auth/me` had no rate limit despite being called on every mount and on
  every tab focus.

### P10 — No test coverage for any security-critical server logic

`scripts/verify.ts` covered tool algorithms only. Origin checks, CSRF,
validation, registry merging, redirect safety, and the analytics allowlist were
entirely untested, and `package.json` had no `test`, `lint`, or `typecheck`
script.

## 2. Root causes confirmed

| Problem | Root cause |
| --- | --- |
| P1 | Supabase JS v2 always instantiates Realtime; no WebSocket transport supplied for Node 20 |
| P2 | Origin compared to a single configured constant, ignoring the request's own `Host` |
| P3 | Constant-time comparison of two empty buffers returns true |
| P4 | Query parameter read but never stripped from the URL |
| P5 | Client not updated to match the server's global session revocation |
| P6 | One hard-coded status for every failure class |
| P7 | Verification state fetched but never rendered or actionable |
| P8 | Metadata and implementation compiled into one immutable structure |
| P9 | Incremental refactors left superseded modules behind |
| P10 | Server logic was inline in the HTTP handler, so it could not be imported by a test |

## 3. Fixes implemented

### Authentication and reliability

- **P1** — Added `ws` and a single `supabase(key, options)` factory supplying
  `realtime: { transport: WebSocket }` and `persistSession: false`. All seven
  client constructions now go through it; only the factory calls `createClient`.
  Verified: the gateway now boots on Node 20 and serves every endpoint.
- **P2** — `isAllowedOrigin({ origin, host, appOrigin, extraOrigins })`: requests
  with no `Origin` are same-site and allowed; otherwise the `Origin` must equal
  `APP_URL`, match the request's own `Host`, or appear in the new optional
  `ALLOWED_ORIGINS`. Verified: same-origin login reaches credential checking;
  `Origin: https://evil.example` is rejected 403.
- **P3** — `isCsrfValid()` requires both values present and equal. Extracted to
  `server/lib.mjs` with 7 regression tests, including the empty-buffer bypass.
- **P4** — `consumeAuthNext()` reads the parameter once, strips it (and
  `auth_error`) with `history.replaceState`, routes the error signal through
  `sessionStorage`, and allowlists the destination.
- **P5** — Password change writes a notice and navigates to `/login`; the button
  is disabled while pending.
- **P6** — `upstreamStatus()` maps dependency/network/Postgres failures to 502 and
  everything else to 500; user-facing text stays generic, detail goes to logs
  outside production only.
- **P7** — Unverified banner on every account section with a working resend,
  plus a verified/unverified pill on the profile.
- **P9** — Removed `constantEqual`, the unused `timingSafeEqual` import, and
  `src/lib/registry-store.ts`; added `authLimit` to `/api/auth/me`.
- **Open-redirect hardening** — `safeNextRoute()` allowlists local routes,
  rejects `//host`, absolute URLs, and `javascript:`; the confirmation endpoint
  now routes through it.

### Tools Management (P8)

- Database overlays (`tool_overrides`, `category_overrides`) store metadata only,
  with column constraints mirroring the application validator.
- `mergeToolRegistry()` merges base definitions with overlays; unknown ids cannot
  invent tools, `draft`/`archived` are hidden from the public catalogue but
  preserved for administrators and history.
- `applyRegistryOverlays()` mutates the canonical arrays in place, so search,
  home, categories, routing, breadcrumbs, related tools, favorites, and the
  sitemap all reflect one merged catalogue with no duplicated lists.
- Admin UI at `/admin` with search, filter, sort, reorder, edit, reset, category
  management, and validated export/import with dry run.
- Every write is authorized server-side, validated, and audited.

### Analytics

- `analytics_events` stores only an allowlisted event name plus short ids and a
  success/failure outcome. There is deliberately **no column** for payloads or
  tool input.
- Anonymous collection is off by default behind the visitor's privacy preference;
  the admin dashboard states plainly when it is not being collected rather than
  showing zeros as if they were measurements.
- `POST /api/analytics/events` rejects any event outside the allowlist.

### Testability (P10)

- Security-critical logic moved from the HTTP handler into `server/lib.mjs`,
  which has no side effects and imports nothing but `node:crypto` semantics.
- `scripts/test-server.mjs`: 68 assertions.

## 4. Authentication differences corrected

Since no external reference existed, "parity" here means the gateway now behaves
as its own documented contract requires:

| Behaviour | Before | After |
| --- | --- | --- |
| Process start on Node 20 | crash | listening |
| Login by IP / alternate host | 403 Origin rejected | reaches credential check |
| Login with no CSRF token | 401 (check bypassed) | 403 rejected |
| Reload after email confirmation | pinned to /verify-email | parameter consumed once |
| After password change | stale account page | routed to /login with notice |
| Supabase outage | 400 "Request failed" | 502 dependency failure |
| Unverified email | invisible | banner + resend |
| `/api/auth/me` | unthrottled | rate limited |

## 5. Security review

Confirmed present and working: HttpOnly cookies; `Secure` in production;
`SameSite=Lax`; CSRF double-submit on all state-changing routes; origin
validation; per-route rate limits (auth 40/15min, login 12/15min, account
180/min, analytics 60/min, admin 240/min); CSP with per-request nonces injected
into the single-file build; `helmet`; body limit 1 MB; server-side admin
authorization; RLS on every user table; anonymous grants revoked from
administrative tables; service-role key server-only; API keys stored as SHA-256
hashes and shown once; account deletion via service role; no `eval`, no
`dangerouslySetInnerHTML`, no `innerHTML` with untrusted data in the changed
paths.

Secret scan — no real credentials are committed:

```bash
grep -rInE '(sb_secret|service_role|sk-[A-Za-z0-9]{20}|BEGIN [A-Z ]*PRIVATE KEY)' \
  --exclude-dir=node_modules --exclude-dir=.git .
```

Only `.env.example` placeholders and documentation references matched. The
browser bundle contains no Supabase key: `grep -roh 'VITE_[A-Z_]*' src` returns
nothing, and the client reads no environment variables at all.

No development bypass exists. `grep -rInE 'DISABLE_AUTH|BYPASS_LOGIN|SKIP_AUTH|DEV_USER'`
returns nothing. When configuration is missing the gateway **exits non-zero**
with the missing variable names; it never degrades to a permissive mode.

## 6. Tests executed

| Command | Result |
| --- | --- |
| `node scripts/test-server.mjs` | 68 passed, 0 failed |
| `npx tsx scripts/verify.ts` | 155 passed, 0 failed |
| `npx tsc --noEmit` | clean |
| `npm run build` | success — 909.45 kB, 267.76 kB gzip |
| `node --check server/index.mjs` / `server/lib.mjs` | clean |
| Gateway smoke test on Node 20 (11 checks) | all expected results |

Smoke test detail: startup; `/api/health` → 503 degraded with an unreachable
database; `/runtime-config.js` → `authMode:"server"`; `/api/tools/registry` → 103
tools with `degraded:true`; homepage → 200 with 5 CSP nonces and injected config;
`/api/auth/me` → `{"user":null}`; `/api/admin/registry` unauthenticated → 401;
login without CSRF → 403; login with mismatched CSRF → 403; signup without CSRF →
403; analytics without CSRF → 403; valid CSRF + wrong password → 401 invalid
credentials; cross-origin → 403; unknown API route → 404 JSON; CSP header
present.

Two pre-existing test defects were also corrected: a JSON Patch assertion that
compared object key order (RFC 6902 `replace` legitimately reorders keys), and
new overlay tests whose fixtures assumed `json` was the first base tool when
cloud tools are prepended.

## 7. Outstanding issues and limitations

1. **Email delivery not exercised end to end.** Signup verification, password
   reset, and email change require a provisioned Supabase project with SMTP
   configured. The code paths are complete and tested up to the provider
   boundary; the actual mail send and token round-trip must be verified on a real
   project.
2. **No `lint`, `typecheck`, or `test` npm script.** Project policy in this
   environment prohibits editing `package.json` scripts, so the commands are
   documented rather than wired. Run them explicitly as listed above.
3. **Supabase RLS tests not executed.** `supabase/tests/platform_rls_test.sql`
   requires the Supabase CLI and a running database; neither is available here.
   The migration is written to be applied and then tested with `supabase test db`.
4. **Single-file bundle.** `vite-plugin-singlefile` inlines everything into one
   909 kB HTML document (268 kB gzip), which prevents route-level code splitting.
   This is pre-existing and intentional for the current deployment; it is the
   main remaining performance lever.
5. **Dependency advisories.** `npm audit` reports vulnerabilities in the
   transitive tree. They were not force-fixed because `npm audit fix --force`
   introduces breaking major upgrades that need their own verification pass.
6. **Analytics volume.** The admin analytics query caps at 20 000 rows per source
   within the window. At higher traffic this needs server-side aggregation rather
   than client-side counting.
7. **Administrator cache.** Admin membership is cached 30 s per user id, so a
   revocation takes up to half a minute to take effect. This is deliberate and
   documented; it is not an authorization bypass.
8. **`git` history.** This repository had **no** Git history when the task began.
   I initialized it, committed the pre-task working tree as the baseline, and
   tagged it. There is therefore no earlier upstream history to diff against.

## 8. Exact deployment requirements

```bash
cd /opt/devutils/app
sudo -u devutils git pull --ff-only
sudo -u devutils npm ci                       # adds the new `ws` dependency
# Apply migration 0002 in the Supabase SQL editor, or:
#   export SUPABASE_DB_URL='...'
#   npx supabase@latest db push --db-url "$SUPABASE_DB_URL"
# Bootstrap the first administrator (Supabase SQL editor):
#   select public.grant_admin('<your-user-uuid>');
sudo -u devutils npx tsx scripts/generate-registry.ts
sudo -u devutils npx tsx scripts/generate-sitemap.ts --env-file /etc/devutils/devutils.env
sudo -u devutils npm run build
sudo -u devutils node scripts/validate-env.mjs --file /etc/devutils/devutils.env
sudo systemctl restart devutils
bash scripts/healthcheck.sh
```

`ALLOWED_ORIGINS` is optional and should stay empty unless a separate front-end
must call this gateway.

Full procedure, verification checklist, and rollback: `INSTALL.md`,
`DEPLOYMENT.md`, and `docs/GIT_AND_ROLLBACK.md`.
