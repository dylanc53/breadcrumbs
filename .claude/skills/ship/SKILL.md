---
name: ship
description: Deploy Breadcrumbs — build the web app, sync the iOS shell, deploy to Vercel production, commit and push. Use for "deploy", "ship it", "push this live", or after finishing any feature.
---

# Ship Breadcrumbs

One path, in this exact order (all from repo root):

```powershell
npm run build
npx cap sync ios
vercel build --prod
vercel deploy --prebuilt --prod --yes
git add -A
git commit   # message per repo style, then:
git push
```

Rules:

- **Never `vercel deploy` without `--prebuilt`** — remote builds break (the
  hosted env var is "Sensitive" and resolves to a placeholder).
- `npm run build` first is the compile check; stop and fix if it fails.
- `npx cap sync ios` must be in the same commit as the web change, or the
  next iOS build ships stale assets.
- If the change touches user-visible flows, run the smoke driver before
  deploying: `npm run dev` (background) then
  `node .claude/skills/run-breadcrumbs/driver.mjs`.
- Web is live immediately at https://breadcrumbs-blue-zeta.vercel.app.
  iPhones only update when Dylan starts the Codemagic `ios-testflight`
  workflow — say so in the summary whenever native behavior changed.
- If deploy returns "Not authorized", retry once (token hiccup); if it
  persists, `vercel login dylancraig53@gmail.com` via device flow.
