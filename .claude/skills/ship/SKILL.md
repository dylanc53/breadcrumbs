---
name: ship
description: Deploy Breadcrumbs — build the web app, sync the iOS shell, commit and push (Vercel auto-deploys on push). Use for "deploy", "ship it", "push this live", or after finishing any feature.
---

# Ship Breadcrumbs

Web deploy is just `git push` — Vercel's GitHub integration builds and
deploys `master` automatically (confirmed working: a plain push produced a
Ready production deployment in ~20s, no CLI needed). The env vars
(`VITE_MAPBOX_TOKEN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are
registered as plain (non-sensitive) Vercel project env vars, so remote
builds see real values — the old "must build locally" workaround no longer
applies and should not come back.

Full sequence, in order, from repo root:

```powershell
npm run build       # compile check — stop and fix if this fails
npx cap sync ios     # keep the native shell in sync with web changes
git add -A
git commit           # message per repo style
git push             # this alone triggers the Vercel deploy
```

Rules:

- **Don't run `vercel build` / `vercel deploy` as part of normal shipping**
  — that's the old manual path, superseded by git auto-deploy. It still
  works as a one-off preview (`vercel deploy --prod --yes`) if ever needed,
  but isn't the routine.
- `npx cap sync ios` must land in the same commit as the web change, or the
  next iOS build ships stale assets.
- If the change touches user-visible flows, run the smoke driver before
  pushing: `npm run dev` (background) then
  `node .claude/skills/run-breadcrumbs/driver.mjs`.
- Web goes live ~20–30s after the push, at
  https://breadcrumbs-blue-zeta.vercel.app. iPhones only update when Dylan
  starts the Codemagic `ios-testflight` workflow — say so in the summary
  whenever native behavior changed.
- **This means shipping web changes no longer requires this specific PC.**
  Any machine with git push access to `dylanc53/breadcrumbs` can ship.
