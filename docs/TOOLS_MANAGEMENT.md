# Tools Management

How DevUtils tools are defined, customized, and administered.

## One source of truth

Tool **implementations** live in code. Tool **metadata** can be customized by
administrators at runtime. Both are merged into a single catalogue that every
surface reads:

```text
src/lib/registry.ts        code-defined base catalogue (id, component wiring,
                           capabilities, privacy, how-it-works)
        |
        |  npx tsx scripts/generate-registry.ts
        v
registry.generated.json    base catalogue as read by the Node gateway
        |
        |  merged with
        v
tool_overrides /           administrator edits stored in PostgreSQL
category_overrides         (name, description, slug, category, order,
        |                   visibility, tags, keywords, related, featured)
        v
GET /api/tools/registry    published, merged catalogue
        |
        +--> browser: applyRegistryOverlays() mutates TOOLS / CATEGORIES /
        |    TOOL_MAP / ROUTE_MAP in place
        |
        +--> search, home, category pages, breadcrumbs, related tools,
             favorites, recent tools, and the sitemap all read that one list
```

Nothing keeps a second, competing tool list. If the gateway is unreachable the
browser falls back to the compiled base catalogue, so the static tool experience
keeps working.

### What an administrator can change

Display name, short and long description, slug (and therefore URL), category,
display order, featured flag, visibility (`published` / `draft` / `archived`),
tags, search keywords, aliases, and related-tool ids.

### What an administrator cannot change

Tool behaviour. The implementation id is fixed and must already exist in
`registry.ts`. There is no field that accepts JavaScript, SQL, or shell, and the
gateway validates every write, so configuration cannot become code execution.

Adding a genuinely new tool is a developer task — see below.

## Administrator access

Authorization is enforced by the gateway against the `admin_users` table on every
privileged request. Hiding the menu item is cosmetic only.

`POST`/`PUT`/`DELETE` to `/api/admin/*` requires, in order:

1. a valid session cookie,
2. a same-origin or explicitly allowed `Origin`,
3. a matching CSRF token,
4. membership in `admin_users` with `role = 'admin'` and no `revoked_at`.

A signed-in ordinary user receives `403 Administrator access required`. Editing
a URL, request body, or local storage cannot grant access.

### Bootstrapping the first administrator

There is no default password and no client-side promotion path. After the user
signs up normally, run this once in the Supabase SQL editor:

```sql
select public.grant_admin('00000000-0000-0000-0000-000000000000');
```

`grant_admin` is `security definer` with `search_path = ''`, is granted only to
`service_role`, and verifies the id exists in `auth.users`. To remove an
administrator:

```sql
select public.revoke_admin('00000000-0000-0000-0000-0000-000000000000');
```

Results are cached for 30 seconds in the gateway, so a revocation takes effect
within half a minute without a restart.

## Using the admin interface

Sign in, then open the account menu → **Admin**, or navigate to `/admin`.

| Section | Purpose |
| --- | --- |
| Overview | Live counts of registered, published, draft, archived tools and how many are customized |
| Tools | Search, filter by category and visibility, sort, reorder, edit metadata, reset to defaults |
| Categories | Rename, re-slug, reorder, enable/disable, see tool counts |
| Analytics | Real usage from `analytics_events` and `usage_records` |
| Audit log | Administrative and account events |
| Health | Per-table reachability and whether a migration is still required |

### Visibility

- `published` — visible everywhere and routable.
- `draft` — hidden from the public catalogue and its route stops resolving, but
  the override is preserved so it can be published again.
- `archived` — hidden and cannot be enabled at the same time; validation rejects
  `archived` + `enabled: true`.

### Reordering

Use the arrows in the Tools table. Each move persists the full ordering through
`POST /api/admin/tools/reorder`, which rejects any id that is not a registered
implementation.

### Slugs and existing URLs

Changing a slug changes the tool's URL to `/tools/<new-slug>`. Previously
published URLs stop resolving, so treat a slug change as a breaking rename and do
it deliberately. Favorites and recent-tool entries reference the stable **id**,
not the slug, so they keep working across renames.

### Export and import

Export writes the current overrides as JSON. Import validates the entire payload
before writing anything, rejects duplicate ids, unregistered ids, and invalid
slugs, and supports a dry run that writes nothing:

```json
{ "tools": [{ "id": "json", "featured": true, "order": 0, "visibility": "published" }] }
```

Reset removes a single tool's override and returns it to its code-defined
defaults.

## Validation rules

Enforced identically by `server/lib.mjs` and the database constraints:

- id: 2–64 chars, `[a-z0-9-]`, must be a registered implementation
- slug: lowercase, digits, single hyphens, no leading/trailing hyphen, unique
- name: 2–80 chars
- description: 8–240 chars
- long description: ≤ 1200 chars
- keywords/aliases: ≤ 24 entries · tags: ≤ 12 · related: ≤ 8
- order: integer 0–9999 (categories 0–999)
- visibility: `published` | `draft` | `archived`
- a tool may not list itself as related

Failures return every message at once and write nothing.

## Adding a new tool (developer task)

1. Implement the tool component under `src/tools/`.
2. Add its entry to `TOOLS` in `src/lib/registry.ts` with a stable id, route,
   category, description, keywords, related ids, and `clientSide` flag.
3. Add the id to the relevant `CATEGORIES[].groups[].tools` list.
4. Add a case to `ToolView` in `src/App.tsx`.
5. Regenerate the gateway catalogue and sitemap:

```bash
npx tsx scripts/generate-registry.ts
npx tsx scripts/generate-sitemap.ts
```

6. Verify:

```bash
npx tsx scripts/verify.ts
npx tsc --noEmit
npm run build
```

## Adding a new category

1. Add the entry to `CATEGORIES` in `src/lib/registry.ts`.
2. Add an icon mapping in `CAT_ICONS` in `src/App.tsx`.
3. Regenerate the registry and sitemap as above.

Category ids are referenced by `tool_overrides.category`, and validation rejects
a category id that does not exist in the base catalogue.

## Auditing

Every administrative write records who, what, and when in `audit_logs` —
`tool_config_changed`, `tool_visibility_changed`, `profile_updated`,
`workflow_created`, `api_key_created`, `api_key_revoked`, `password_changed`,
`logged_in`. Passwords, tokens, API-key secrets, and tool input are never
written to the audit log; API keys are recorded by id and prefix only.
