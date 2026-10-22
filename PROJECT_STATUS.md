# DevUtils Project Status

Last updated: 2026-10-22

## Current release status
- Status: corrected release candidate; not yet validated against live Supabase or deployed to Production.
- Production baseline: the existing working version on EC2 remains the source of truth until the new release is reviewed and deployed.
- Application path: `/opt/devutils/app`.
- Environment file: `/etc/devutils/devutils.env` (do not commit or copy it into the source archive).

## Architecture
- React + TypeScript + Vite frontend.
- Node.js / Express backend.
- Supabase Auth and PostgreSQL accessed through the backend.
- Nginx reverse proxy and systemd service `devutils`.

## Working behavior that must be preserved
- Signup, email confirmation, login/logout, and password recovery use the established Supabase-backed server-side flow.
- Sessions use HttpOnly cookies; CSRF and origin checks remain enabled.
- Account data loads by stable user ID and must not loop on auth object refreshes.
- Favorite subscriptions share the source subscription, deduplicate the initial HTTP request, and scope the in-memory cache to one user.
- Admin API authorization is checked on the server.

## Features in the candidate
- Existing developer / DevOps / cloud tool registry.
- Admin overview, tool metadata overrides, category metadata overrides, registry import/export, analytics, and audit endpoints.
- New database objects for administrator membership, overrides, and privacy-limited analytics (migration application must be confirmed in the actual Supabase project).

## Corrections in this candidate
- Restored Account loading dependency to `auth.user?.id` and removed duplicate refresh-plus-load after profile saves.
- Restored shared Favorites caching, in-flight request deduplication, and user-scoped invalidation.
- Updated adaptive repositories to fan out a single source subscription rather than creating a source subscription for every UI subscriber.
- Admin authorization now selects and checks `revoked_at`.
- Admin reorder/import check Supabase write results and use bulk upserts; import now handles category overrides rather than silently ignoring them. Tool long descriptions are mapped to the actual snake_case database column, and duplicate slugs are rejected during import validation.
- Added audit action constraint migration for admin events; application to production is still pending verification.
- Admin write endpoints explicitly report when the data write succeeded but audit logging failed.
- Added server-side tests for the admin authorization-record helper, category import validation, and an HTTP-mocked favorites regression test.

## Required before production
1. Install dependencies cleanly with `npm ci`.
2. Run all verification commands listed in `AI_CONTEXT.md`.
3. Inspect actual Supabase migration history and audit CHECK constraint.
4. Apply migrations only after backup and only in the correct order.
5. Test admin authorization, tool/category edits, analytics, audit writes, auth, account, and favorites in staging.
6. Review all diffs and deployment/environment differences against the live server.

## Known scope limits
- User management is not implemented as a full Admin section.
- Adding executable tool implementations still requires code and a registry build; Admin manages metadata for registered tools.
- Billing provider/checkout is not configured.
- This release candidate has not yet been proven identical to Production.

## Phase 5 — accounts and personalization (2026-10-21/22)

- Branch `phase5/accounts`, not yet merged or deployed. Test gateway runs on
  port 3100 (temporary, started from `/home/ubuntu/test/devutils-test`);
  production still serves the pre-Phase-5 copy from `/opt/devutils/app`.
- Features: pinned tools with user-defined ordering (local for anonymous
  users, cloud when signed in), personal collections with items, account
  dashboard pinned panel, Home pinned chips, tool-card pin toggle, JSON
  export/import of personal configuration, Settings consolidation.
- Database: migrations `202610210001` (new tables) and `202610220001`
  (grant-restore hotfix after the global REVOKE incident; see CHANGELOG).
  Both are applied to the shared Supabase project and privileges are verified.

### Required before production (Phase 5)
1. Complete the live two-user spot-check against port 3100.
2. Merge `phase5/accounts` into `master` and review the merge diff.
3. Deploy to `/opt/devutils/app` (it is a copy, not a git clone — plan a
   scripted rsync/copy or convert it to a tracked clone), run `npm ci` and
   `npm run build`, then `systemctl restart devutils`.
4. Stop the temporary 3100 gateway after production deployment is verified.
5. Re-run the two-user spot-check against production.
