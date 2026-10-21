# DevUtils Patch and Deployment Guide

## Safety status
This patch has not been deployed. The backend pure tests and JavaScript syntax checks pass. A runtime harness against the actual Favorites classes also passed request-sharing, toggle propagation, cache-scope reset, and account-switch checks. However, dependency installation was interrupted in the build environment, so the committed TSX test runner, full TypeScript checks, full verification script, and Vite production build must pass on a machine with dependencies installed before deployment.

## 1. Apply the patch in VS Code (Windows)
1. Close any running `npm run dev` or build process.
2. Copy the entire current project folder to a separate backup folder.
3. Download and extract `devutils-patch-files.zip` into the root of your open project (the folder containing `package.json`). Preserve the folder paths and allow overwriting files when asked.
4. Do not copy any `.env` file from elsewhere and do not paste server environment values into the project. The patch does not require new environment variables.
5. Review `UPDATE_MANIFEST.md` and `git diff` before accepting the changes.

## 2. Validate locally
From the project root in the VS Code terminal:

```bash
npm ci
npm run test:server
npm run test:favorites
npx tsx scripts/verify.ts
npx tsc --noEmit
npm run build
```

All commands must pass. If `npm ci` fails, do not deploy. If the TSX favorites test fails, debug it before moving on. Inspect `dist/index.html` after a successful build and confirm that no credentials are present in the client bundle.

## 3. Record the baseline in Git
If the repository already has Git history, do not run `git init`; inspect `git status` and preserve its existing history. If there is no Git repository, first check `.gitignore` and confirm that `.env`, `.env.*` (except a sanitized `.env.example`), `node_modules/`, `dist/`, dumps, and backups will not be committed. Then:

```bash
git init -b main
git add -A
git diff --cached --name-only
```

Inspect the staged file list and remove any secrets before committing:

```bash
git commit -m "Correct DevUtils admin and favorites release candidate"
git tag devutils-rc-20261020
```

## 4. Before changing the EC2 server
- Confirm the actual source on EC2 and compare it with this candidate. Do not overwrite the entire application directory just because the archive builds.
- Take a file backup and a database backup.
- Inspect the current systemd unit, Nginx configuration, environment file path, user/group, and `ExecStart`. Keep the live `/etc/devutils/devutils.env`, systemd unit, and HTTPS Nginx configuration unless a separately reviewed change is necessary.
- Inspect Supabase migration history and the live `audit_logs` CHECK constraint.
- Apply `202610190002_tools_admin_analytics.sql` only if it has not been applied; apply `202610200001_audit_admin_actions.sql` only after verifying its effect and backup. If migrations are managed with Supabase CLI, use the project's normal migration workflow rather than ad-hoc edits.
- Do not give Admin privileges until confirming the intended account UUID.

## 5. Deployment outline (only after local and staging checks pass)
1. Upload the reviewed commit/archive to EC2 into a separate staging folder; do not extract it over `/opt/devutils/app` first.
2. Install dependencies and run the test/build commands in staging.
3. Compare the candidate with `/opt/devutils/app` and review every changed file. Do not use `rsync --delete`.
4. Put the application into a planned maintenance window if needed, back up the old app, then apply only the reviewed files/build artifacts.
5. Run the environment validator, generate registry/sitemap artifacts using the current server configuration, build production assets, restart the existing `devutils` service, and run the health checks.
6. Test auth, email confirmation, account/profile, Favorites, non-admin denial, admin tools/categories, audit logging, and analytics.
7. Keep the previous source/build and backup until the new release is verified. If any critical smoke test fails, roll back application files to the previous commit/backup. Do not automatically reverse database migrations.

## Important
The new audit migration is a separate forward migration because the existing base migration may already have been applied. A database schema change is not rolled back by restoring source files.
