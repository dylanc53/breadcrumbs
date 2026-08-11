---
name: run-breadcrumbs
description: Run, launch, smoke-test, or screenshot the Breadcrumbs canvassing app — start the Vite dev server and drive the real UI (landing → login → dashboard → map → visit form) headlessly with the Playwright driver. Use for "run the app", "screenshot the app", "does the app still work", or verifying a change in the real UI.
---

# Run Breadcrumbs

Breadcrumbs is a Vite + React + Mapbox web app (Supabase backend) with a
Capacitor iOS shell. The web app is the drivable surface on this Windows
machine; the driver is `.claude/skills/run-breadcrumbs/driver.mjs`
(playwright-core + installed Chrome, headless). All paths below are relative
to the repo root.

## Prerequisites

- Node + npm (present), Google Chrome (present — driver uses `channel: 'chrome'`)
- `npm install` (playwright-core is a devDependency; no browser download needed)
- `.env` with `VITE_MAPBOX_TOKEN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (already populated in this checkout)

## Run + smoke (agent path)

Start the dev server in the background, then run the driver:

```powershell
npm run dev        # background it; ready in ~1s at http://localhost:5173
node .claude/skills/run-breadcrumbs/driver.mjs
```

The driver walks the real flow — landing page → Log in → dashboard → map →
tap-to-open visit form — printing `PASS`/`FAIL` per step and exiting 1 on any
failure. Screenshots land in `.claude/skills/run-breadcrumbs/shots/`
(gitignored): `01-landing`, `02-login`, `03-dashboard`, `04-map`,
`05-visit-form`, and `99-failure` on error. **Look at the screenshots** —
`04-map` must show satellite tiles, not a blank canvas.

Against production instead (no dev server needed):

```powershell
node .claude/skills/run-breadcrumbs/driver.mjs https://breadcrumbs-blue-zeta.vercel.app .claude/skills/run-breadcrumbs/shots-prod
```

### Test account

The driver logs in as `dylancraig53+smoke@gmail.com` / `smoke-test-2026!` —
a dedicated account in its own org ("Mitchell Exteriors", profile name "Ray
Mitchell"), isolated from the real team by row-level security. Override with
`BREADCRUMBS_TEST_EMAIL` / `BREADCRUMBS_TEST_PASSWORD`. Don't log this
account into the real team; pins it saves would pollute real data.

These same credentials are what Apple's reviewers use — see
`app-store-submission.md`.

## Demo data

```powershell
node .claude/skills/run-breadcrumbs/seed-demo.mjs
```

Wipes and re-seeds the smoke account with a 60-point walking route through a
Southaven neighborhood and 9 visits (real reverse-geocoded addresses, varied
statuses, customer details, revisit flags), and sets the org's region tight
around those streets. Run this before screenshots or any demo.

## App Store assets

```powershell
node .claude/skills/run-breadcrumbs/make-icon.mjs      # icon → ios asset + public/
node .claude/skills/run-breadcrumbs/store-shots.mjs    # 5 shots at 1320x2868 → store-shots/
```

`store-shots.mjs` runs against production by default and captures dashboard,
map, visit sheet, history calendar, and team picker at the 6.9" iPhone size
Apple requires. Re-run `seed-demo.mjs` first or the screens will be empty.

## Run (human path)

`npm run dev` → open http://localhost:5173 in a browser. Add `-- --host` to
test from a phone on the LAN (plain-LAN was firewall-blocked here; Tailscale
worked). GPS and `crypto.randomUUID` need HTTPS or localhost.

## iOS app

Cannot be built or launched from this Windows machine. Push to `master`,
start the `ios-testflight` workflow in Codemagic, install via TestFlight.
Run `npx cap sync ios` after web changes before committing.

## Deploy (web)

```powershell
vercel build --prod
vercel deploy --prebuilt --prod --yes
```

Local build is mandatory — the Vercel-hosted env var is stored "Sensitive",
so remote builds receive a placeholder and produce a broken bundle.

## Gotchas

- **Two "Log in" buttons on the landing page** (nav + hero CTA) — the driver
  uses `.first()`. Adding more will not break it; renaming them will.
- **Login success is detected via `.dash-brand`** (dashboard header). If the
  post-login home changes, update that selector in the driver.
- **Mapbox renders fine in headless Chrome** (software WebGL) but tiles take
  a few seconds — the driver waits 4s after the map mounts before shooting.
- **Map pins overlap and intercept each other's clicks** — Playwright's
  normal `.click()` times out with "intercepts pointer events". Use
  `.dispatchEvent('click')` on the marker instead (see `store-shots.mjs`).
- **A wide sales region makes for useless screenshots** — pins collapse into
  one blob and the route trail vanishes. `seed-demo.mjs` deliberately sets a
  neighborhood-sized region so the map opens at street level.
- **The map may show "No address found"** when tapped at low zoom over open
  land — expected, not a failure; the pin still saves by coordinates.
- **Vite auto-restarts when `.env` changes** — no manual restart needed.
- **StrictMode double-mount** is handled in the map init; if the map ever
  renders blank in dev, check that `mapRef.current` is nulled in the cleanup.

## Troubleshooting

- `browserType.launch: Chrome distribution 'chrome' not found` → Chrome
  isn't installed; either install it or `npm i -D playwright` +
  `npx playwright install chromium` and drop the `channel` option.
- Driver times out at `waitForSelector('.dash-brand')` → login failed; check
  the smoke account still exists (Supabase → Authentication → Users) and
  that the anon key in `.env` matches the project.
- `ERR_CONNECTION_REFUSED` at localhost:5173 → dev server isn't running or
  is on another port (Vite bumps to 5174 if 5173 is taken — pass the URL).
