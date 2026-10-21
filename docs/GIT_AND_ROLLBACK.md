# Git Safety, Deployment, and Rollback

Real references for this repository — not placeholders.

| Item | Value |
| --- | --- |
| Backup tag | `pre-repair-baseline` |
| Base commit | `4233b469dad3de746fb0b53a71a0630ec8ba8c7d` |
| Implementation branch | `feature/repair-tools-admin` |
| Default branch | `main` (points at the base commit) |
| Backup archive | `/tmp/devutils-backup-20261019T193147Z.tar.gz` |
| Patch artifact | `devutils-repair.patch` (repository root) |

**Important context:** this working tree had **no Git repository** when the task
began. I initialized one, committed the entire pre-task working tree as the
baseline, tagged it `pre-repair-baseline`, and created
`feature/repair-tools-admin` from it. There is therefore no earlier upstream
history, and `main` is the recovery point.

Deployment target discovered from the repository: Ubuntu + Nginx + systemd +
Node gateway on `127.0.0.1:3000`, with hosted Supabase PostgreSQL/Auth.
Application directory `/opt/devutils/app`, environment file
`/etc/devutils/devutils.env`, service `devutils`.

## 1. Before applying changes

Run on the server from `/opt/devutils/app`.

```bash
# Confirm where you are and that the tree is clean.
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --porcelain

# Record the running revision so you can prove what is deployed.
sudo systemctl show devutils -p ActiveEnterTimestamp --value
git rev-parse HEAD | sudo tee /var/lib/devutils-deployed-revision

# Preserve any local server modifications BEFORE pulling. Do not discard them.
git stash push --include-untracked --message "pre-update-$(date -u +%Y%m%dT%H%M%SZ)"
git stash list

# Create a dated safety tag at the current production commit.
git tag -a "prod-before-$(date -u +%Y%m%d)" -m "Production state before update"

# Back up the environment file (it is not in Git) and the database.
sudo cp -a /etc/devutils/devutils.env "/root/devutils.env.$(date -u +%Y%m%dT%H%M%SZ).bak"
sudo chmod 0600 /root/devutils.env.*.bak
```

Database backup — the Supabase project is the primary backup (auth identities live
in the managed `auth` schema). For an additional public-schema dump:

```bash
export SUPABASE_DB_URL='postgresql://postgres.PROJECT_REF:PASSWORD@HOST:5432/postgres?sslmode=require'
sudo -E bash scripts/backup.sh          # writes /var/backups/devutils/*.dump, mode 0600
unset SUPABASE_DB_URL
```

Never paste the service-role key or database password into a command that lands
in shell history; prefer a file sourced with `set -a`, or export/unset around the
call as shown.

### Review the change before deploying

```bash
git fetch --all --prune
git log --oneline --graph pre-repair-baseline..origin/feature/repair-tools-admin
git diff --stat pre-repair-baseline..origin/feature/repair-tools-admin
git diff --check pre-repair-baseline..origin/feature/repair-tools-admin   # whitespace errors
git diff pre-repair-baseline..origin/feature/repair-tools-admin -- server/ supabase/
```

Confirm the file manifest matches `CHANGELOG.md`, and read the two items that
require action:

- new migration `supabase/migrations/202610190002_tools_admin_analytics.sql`
- new runtime dependency `ws`

If you received the patch artifact instead of a branch:

```bash
git apply --check devutils-repair.patch     # validates without writing
git apply --stat  devutils-repair.patch
git apply         devutils-repair.patch
```

The patch expects base commit `4233b469dad3de746fb0b53a71a0630ec8ba8c7d`.

## 2. Verify the change in a staging checkout first

Do this on the server (or a staging host) before touching the running service.

```bash
git worktree add /opt/devutils-staging origin/feature/repair-tools-admin
cd /opt/devutils-staging
npm ci

# Static checks
npx tsc --noEmit
node --check server/index.mjs && node --check server/lib.mjs

# Unit tests (no database or network required)
node scripts/test-server.mjs        # expect: 68 passed, 0 failed
npx tsx scripts/verify.ts           # expect: 155 passed, 0 failed

# Build
npm run build

# Configuration validation (prints no secret values)
node scripts/validate-env.mjs --file /etc/devutils/devutils.env
```

Boot the staging copy on a spare private port and exercise it, leaving
production untouched:

```bash
set -a; . /etc/devutils/devutils.env; set +a
PORT=3999 APP_URL=http://localhost:3999 NODE_ENV=development node server/index.mjs &
sleep 3
curl -s -o /dev/null -w "health %{http_code}\n"      http://127.0.0.1:3999/api/health
curl -s -o /dev/null -w "registry %{http_code}\n"    http://127.0.0.1:3999/api/tools/registry
curl -s -o /dev/null -w "admin401 %{http_code}\n"    http://127.0.0.1:3999/api/admin/registry
curl -s -o /dev/null -w "csrf403 %{http_code}\n" -X POST http://127.0.0.1:3999/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"a@b.co","password":"x"}'
kill %1
cd /opt/devutils/app
git worktree remove /opt/devutils-staging
```

Expected: `health` 200 or 503-degraded (503 only if the DB is unreachable),
`registry` 200, `admin401` 401, `csrf403` 403.

## 3. Apply migrations

Migration 0002 is additive — new tables, indexes, and functions. It does not
alter or drop existing user data. Apply it **before** restarting the new code,
because `/api/admin/health` reports `migrationRequired` when the tables are
absent.

Simplest path (Supabase SQL Editor): paste and run the full contents of
`supabase/migrations/202610190002_tools_admin_analytics.sql`.

CLI path from a trusted terminal:

```bash
export SUPABASE_DB_URL='postgresql://postgres.PROJECT_REF:PASSWORD@HOST:5432/postgres?sslmode=require'
npx supabase@latest db push --db-url "$SUPABASE_DB_URL"
npx supabase@latest test db --db-url "$SUPABASE_DB_URL"   # runs supabase/tests/*.sql
unset SUPABASE_DB_URL
```

Then bootstrap the first administrator (there is no default password and no
client-side promotion path):

```sql
select public.grant_admin('YOUR-USER-UUID');
select * from public.admin_users;
```

## 4. Deploy to production

```bash
cd /opt/devutils/app
git rev-parse HEAD | sudo tee /var/lib/devutils-previous-revision
sudo -u devutils git pull --ff-only
sudo -u devutils npm ci                                  # installs `ws`
sudo -u devutils npx tsx scripts/generate-registry.ts
sudo -u devutils npx tsx scripts/generate-sitemap.ts --env-file /etc/devutils/devutils.env
sudo -u devutils npm run build
sudo -u devutils node scripts/validate-env.mjs --file /etc/devutils/devutils.env
sudo systemctl restart devutils
sleep 3
bash scripts/healthcheck.sh
```

`scripts/deploy.sh` performs the same sequence. It does not modify
`/etc/devutils/devutils.env` and does not run migrations.

Confirm the deployed revision and that Nginx is fronting it:

```bash
git rev-parse HEAD
sudo systemctl status devutils --no-pager
curl -fsS https://YOUR_REAL_DOMAIN/api/health
curl -fsS -o /dev/null -w "%{http_code}\n" https://YOUR_REAL_DOMAIN/
curl -s https://YOUR_REAL_DOMAIN/runtime-config.js
```

## 5. Post-deployment verification

```bash
sudo journalctl -u devutils -n 100 --no-pager
sudo ss -lntp | grep -E ':80|:443|:3000'      # 3000 must be 127.0.0.1 only
sudo nginx -t
```

In a browser, on the real HTTPS domain:

1. Homepage, search, a JSON tool, copy, and download work **signed out**.
2. `/signup` → verification email arrives → link returns to DevUtils with no
   token visible in the address bar.
3. `/login` creates only `Secure`/`HttpOnly` cookies (check DevTools →
   Application → Cookies; `du_access` and `du_refresh` must be HttpOnly).
4. Reload `/account` — the session is restored without re-authenticating.
5. `/account/favorites`, recent tools, presets, and workflows persist across a
   reload.
6. `/account/security` shows verification state; change password → you are routed
   to `/login` and the old session is dead.
7. Sign out → `/account` requires sign-in again.
8. Forgot password → generic response for both known and unknown addresses.
9. As the bootstrapped administrator: the account menu shows **Admin**;
   `/admin/tools` edits, reorders, and changes visibility; the public catalogue
   and search reflect the change within ~15 seconds.
10. As a **non**-administrator: `/api/admin/registry` returns 403 and `/admin`
    shows the denial panel.

## 6. Recovery

### Option A — investigate without destroying anything

Use this when the new version misbehaves but you want to keep the failed state
for diagnosis, and preserve any local modifications.

```bash
cd /opt/devutils/app

# Capture diagnostics from the failing version first.
sudo journalctl -u devutils -n 500 --no-pager > /root/devutils-failure-$(date -u +%Y%m%dT%H%M%SZ).log
git rev-parse HEAD   > /root/devutils-failed-revision.txt
git status --porcelain >> /root/devutils-failed-revision.txt

# Keep local modifications; do not reset or clean.
git stash push --include-untracked --message "failed-version-$(date -u +%Y%m%dT%H%M%SZ)"

# Create a separate worktree at the known-good baseline. The failed checkout
# stays exactly as it is, so you can compare the two side by side.
git worktree add /opt/devutils-recovery pre-repair-baseline
cd /opt/devutils-recovery
npm ci && npm run build
PORT=3998 APP_URL=http://localhost:3998 NODE_ENV=development \
  SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
  node server/index.mjs
```

Test the recovered build on port 3998 while production stays on 3000. Nothing is
deleted, and you can return to the failed version with
`git worktree remove /opt/devutils-recovery`.

### Option B — roll back the deployed application

```bash
cd /opt/devutils/app
PREVIOUS="$(cat /var/lib/devutils-previous-revision)"
echo "Rolling back to $PREVIOUS"

sudo -u devutils git fetch --all --prune
sudo -u devutils git checkout "$PREVIOUS"
sudo -u devutils npm ci
sudo -u devutils npx tsx scripts/generate-registry.ts
sudo -u devutils npm run build
sudo systemctl restart devutils
sleep 3
bash scripts/healthcheck.sh
sudo journalctl -u devutils -n 50 --no-pager
```

If the bad state was already committed and pushed, prefer a reviewed revert over
rewriting shared history:

```bash
git revert --no-edit <bad-commit-sha>
npm ci && npm run build
sudo systemctl restart devutils
```

The environment file is never touched by either procedure.

### Database rollback — read this before acting

**Reverting application code does not reverse a database migration.**

Migration 0002 is additive, so the previous application version continues to work
against the new schema: it simply does not read `tool_overrides`,
`category_overrides`, `admin_users`, or `analytics_events`. **In almost every
case, do nothing to the database.** Administrator edits made through the new UI
are ignored by the old code but are not lost, and they apply again if you roll
forward.

If you must remove the new objects, this is destructive to administrator
configuration and analytics history — take a fresh verified backup first:

```sql
drop function if exists public.grant_admin(uuid, uuid);
drop function if exists public.revoke_admin(uuid);
drop function if exists public.prune_analytics(integer);
drop table if exists public.analytics_events;
drop table if exists public.category_overrides;
drop table if exists public.tool_overrides;
drop table if exists public.admin_users;
```

Restoring a database dump is a last resort: it discards everything written after
the backup, including accounts created in the meantime. Restore the whole Supabase
project through the provider's restore workflow rather than mixing a partial
`pg_restore` with live `auth` data. `scripts/backup.sh` dumps the `public` schema
only and cannot restore `auth.users`.

## 7. Command sequences you asked for

**Review the changes**

```bash
cd /opt/devutils/app
git diff --stat pre-repair-baseline..feature/repair-tools-admin
git diff pre-repair-baseline..feature/repair-tools-admin -- server/ supabase/ src/lib/registry.ts
```

**Test locally / on staging**

```bash
npm ci
npx tsc --noEmit
node scripts/test-server.mjs
npx tsx scripts/verify.ts
npm run build
node scripts/validate-env.mjs --file /etc/devutils/devutils.env
```

**Deploy the verified update**

```bash
cd /opt/devutils/app && bash scripts/deploy.sh
```

**Check health and logs**

```bash
bash scripts/healthcheck.sh
curl -fsS https://YOUR_REAL_DOMAIN/api/health
sudo systemctl status devutils --no-pager
sudo journalctl -u devutils -n 100 --no-pager
```

**Return to the previous working version**

```bash
cd /opt/devutils/app
sudo -u devutils git checkout "$(cat /var/lib/devutils-previous-revision)"
sudo -u devutils npm ci && sudo -u devutils npm run build
sudo systemctl restart devutils && bash scripts/healthcheck.sh
```

**Return to the new implementation after a rollback test**

```bash
cd /opt/devutils/app
sudo -u devutils git checkout feature/repair-tools-admin
sudo -u devutils npm ci
sudo -u devutils npx tsx scripts/generate-registry.ts
sudo -u devutils npm run build
sudo systemctl restart devutils && bash scripts/healthcheck.sh
```

## 8. Destructive commands this guide deliberately never uses

`git reset --hard`, `git clean -fd`, `git checkout -- .`, force pushes, and broad
file restorations all discard work irrecoverably. Nothing above requires them.
Local modifications are preserved with `git stash`, the failed version is kept for
diagnosis with `git worktree`, and shared history is corrected with `git revert`.
