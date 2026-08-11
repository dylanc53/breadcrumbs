---
name: db-migration
description: Add or change Breadcrumbs database schema — write a numbered Supabase migration, wire RLS, update the app's adapters. Use for "add a column/table", "schema change", "new migration", or any Supabase DDL.
---

# Database migrations

The Supabase project (`lafzoojalvjvefppmdmm`) has no CLI/CI migration
pipeline. Schema changes are numbered SQL files that Dylan pastes into the
Supabase SQL editor by hand.

Steps:

1. Create `supabase/migration-N-short-name.sql` (N = next number; check the
   folder). Header comment: what it does + "Run once in Supabase: SQL Editor
   -> New query -> paste -> Run."
2. Every new table needs: `org_id` FK to orgs (multi-tenant), RLS enabled,
   and policies following the house pattern — read for org members
   (`org_id = public.my_org()`), write own rows (`rep_id = auth.uid()`),
   manager override via `public.my_role() = 'manager'`. Add to the
   `supabase_realtime` publication only if the app subscribes to changes.
3. Update the app in the same change: snake_case column ↔ camelCase field in
   `visitFromDb`/`routeFromDb` (or a new adapter) in `src/App.jsx`, plus
   inserts/updates that should carry the new field.
4. Code must tolerate the migration NOT having run yet (Dylan applies it
   manually, sometimes late). Prefer additive columns with defaults; surface
   Supabase errors via the existing `alert(error.message)` pattern.
5. In the final summary, tell Dylan explicitly to run the new migration file,
   with the SQL editor link:
   https://supabase.com/dashboard/project/lafzoojalvjvefppmdmm/sql/new

Gotchas already learned:

- `security definer` functions granted to `authenticated` are also callable
  by `anon` unless revoked — harmless only if they depend on `auth.uid()`.
- Vercel env vars marked "Sensitive" and RLS have burned us before; test new
  policies with the smoke account (isolated org) via the REST API before
  telling Dylan it's done.
- Deleting a profile cascades from `auth.users`; visits/routes keep the row
  with `rep_id = null` ("Former rep") by design — don't "fix" that.
