# Breadcrumbs

Door-to-door sales canvassing app: reps pin houses (cold/warm/hot + notes),
GPS routes draw as breadcrumb trails, teams share one map. Live at
https://breadcrumbs-blue-zeta.vercel.app and on iOS via App Store Connect
(bundle `com.customremodeling.breadcrumbs`).

## Stack

- React + Vite (plain JS, no TS), Mapbox GL JS. All styles are plain CSS
  classes in `src/App.css`.
- Supabase: Postgres + auth + RLS + realtime. Client in `src/supabase.js`.
- Capacitor iOS shell (`ios/`): Transistorsoft background-geolocation,
  Capgo speech-recognition. Built only by Codemagic (Windows can't build iOS).
- Key files: `src/App.jsx` (map screen, panels, all CRUD), `Dashboard.jsx`,
  `Auth.jsx`, `Root.jsx` (session gating), `tracking.js` (native/web GPS
  switch), `dictation.js` (native/web voice switch).

## Data model (multi-tenant from day one)

`orgs` (join_code, region jsonb) → `profiles` (role: rep|manager) →
`visits` / `routes` / `live_locations`, all carrying `org_id` + `rep_id`.
RLS: org members read org data; reps write their own; managers edit any.
Lead details (status/note/customer fields) are masked CLIENT-SIDE for
non-owner teammates — teammates see neutral pins; managers see all.

Rows are snake_case; app objects are camelCase via `visitFromDb`/`routeFromDb`
adapters in App.jsx. Follow that pattern for new fields.

## Non-negotiable rules

- **Deploy web with a LOCAL build only**: `vercel build --prod` then
  `vercel deploy --prebuilt --prod --yes`. Remote Vercel builds get a
  placeholder for the "Sensitive" env var and ship a broken bundle.
- **Schema changes** = new `supabase/migration-N-*.sql` file; Dylan pastes it
  into the Supabase SQL editor manually. Never assume a migration has run.
- **After any web change, run `npx cap sync ios` before committing** so the
  native shell stays current; iOS ships via Codemagic `ios-testflight`
  workflow (signing uses stored identities named `breadcrumbs` /
  `breadcrumbs_app_store` — automatic signing does NOT work).
- **Never remove the Mapbox logo/attribution** (free-tier ToS; token risk).
- **Don't wipe or delete `dylancraig53+smoke@gmail.com`** — it's the smoke-test
  AND Apple review demo account (org "Mitchell Exteriors"). Reseed with
  `node .claude/skills/run-breadcrumbs/seed-demo.mjs`.
- iOS suspends WebView JS: route paths must come from the Transistorsoft
  native DB (`getRecordedPoints`), never from JS callbacks alone.
- Region lock is zoom-aware (`applyRegionLeash` in App.jsx). Known open bug:
  zooming toward a border pin still misbehaves — reproduce with the driver
  before touching it.

## Verify changes

Smoke test the real UI: `/run-breadcrumbs` skill —
`node .claude/skills/run-breadcrumbs/driver.mjs` against a running
`npm run dev`. App Store assets/copy: `app-store-submission.md`.
