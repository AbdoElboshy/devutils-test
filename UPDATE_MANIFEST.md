# Update Manifest — corrected release candidate

Date: 2026-10-20
Status: awaiting dependency installation, full test/build verification, and staging review. Not deployed.

## Added files
- `AI_CONTEXT.md` — architecture and AI change rules.
- `PROJECT_STATUS.md` — current project state and deployment gates.
- `UPDATE_MANIFEST.md` — file-level release manifest.
- `PATCHING_AND_DEPLOYMENT.md` — local validation, staging, and production deployment sequence.
- `scripts/test-favorites.ts` — regression test for request deduplication, toggle refresh, and cache user-scope invalidation.
- `supabase/migrations/202610200001_audit_admin_actions.sql` — forward migration permitting the admin audit actions while preserving existing action values.

## Modified files
- `src/pages/account.tsx` — uses stable user ID dependency; avoids redundant auth refresh + explicit account reload after profile save.
- `src/platform/http-repositories.ts` — request cache and in-flight deduplication for favorites; cache scoped by user and protected against stale in-flight responses.
- `src/platform/adaptive-repositories.ts` — centralizes each adaptive repository's source subscription and clears old account data on identity/source change.
- `src/pages/admin.tsx` — clarifies the two required migrations and bootstrap warning in the health view.
- `server/index.mjs` — selects `revoked_at`, checks the admin record helper, maps tool fields to database columns, restricts category overrides to registered categories, records audit failures safely, validates writes for reorder/import, bulk-upserts tools, imports categories too, and checks all admin analytics queries for errors.
- `server/lib.mjs` — adds pure `isActiveAdminRecord` and DB-column mapping helpers, correctly maps `long_description` to the frontend's `longDescription`, and validates/imports category overrides instead of silently dropping them, and rejects duplicate import slugs before writing.
- `scripts/test-server.mjs` — adds admin record/revocation and category-import regression checks.
- `package.json` — adds `test:server` and `test:favorites` scripts.

## Database changes
- New forward migration `202610200001_audit_admin_actions.sql` adds `tool_config_changed` and `tool_visibility_changed` to the existing audit action constraint while preserving the prior values.
- Do not apply until the actual Supabase schema and migration history are inspected and a backup is available.

## API changes
- Admin reorder/import now return an error rather than reporting success when the Supabase write fails.
- Admin mutations return a clear error response with `saved: true` if the database write succeeded but audit insertion failed. The operator should inspect audit history before retrying.

## Environment changes
- None required by this patch.
- Keep production values in `/etc/devutils/devutils.env`.

## Dependency changes
- No new npm dependency intentionally added by these corrections. The package scripts use the existing `tsx` dev dependency.

## Deleted files
- None.

## Verification status
- `node scripts/test-server.mjs`: passed (78 tests).
- `node --check server/index.mjs`: passed.
- `node --check server/lib.mjs`: passed.
- `npm ci`: did not complete within the available command window.
- `npm run build`: not run successfully because `vite` was not installed after the interrupted install.
- The committed `scripts/test-favorites.ts`, `npx tsx scripts/verify.ts`, and `npx tsc --noEmit`: not yet independently executed because the candidate dependencies could not be installed in this environment. An equivalent runtime harness loaded the actual Favorites repository/adaptive source through the globally available TypeScript transpiler and passed shared-request, toggle-propagation, user-cache invalidation, and adaptive resubscription checks.
- Live Supabase migration/RLS tests: not executed.

## Deployment status
- No production files or live database were changed by this work.
