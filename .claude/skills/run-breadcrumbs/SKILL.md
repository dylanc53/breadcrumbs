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
a dedicated account in its own "Smoke Test" org, isolated from the real team
by row-level security. Override with `BREADCRUMBS_TEST_EMAIL` /
`BREADCRUMBS_TEST_PASSWORD` env vars. Don't log the smoke account into the
real team; pins it saves would pollute real data (its own org is fine).

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
- **The smoke org has no sales region**, so the map opens on the whole-US
  view, and a tap at that zoom finds no street address — the form shows
  "No address found" and that's expected, not a failure.
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
