# 🍞 Breadcrumbs

Door-to-door sales canvassing app. Reps drop pins at the houses they visit,
tag the lead cold/warm/hot with notes and customer info, and their walking
route draws itself as a breadcrumb trail on a satellite map. Managers see the
whole team; teammates see each other's coverage without seeing each other's
leads.

- **Web app:** https://breadcrumbs-blue-zeta.vercel.app
- **iOS app:** distributed through TestFlight (built by Codemagic from this repo)

## Features

- **Pins** — tap the map or use GPS; the street address, neighborhood, city,
  and zip fill in automatically via reverse geocoding
- **Visit form** — customer name/phone/email, cold/warm/hot status, notes with
  voice dictation, and a "Revisit this door" flag (amber-ringed pin)
- **Selling sessions** — Start/Stop selling records a GPS breadcrumb route;
  on iOS the native tracker keeps recording with the phone in a pocket
- **Live locations** — while a session runs, the rep's position streams to
  every teammate's map as a pulsing dot (Supabase realtime)
- **Team model** — first user creates a team (manager) and invites reps with a
  6-character join code; managers can edit any pin, remove members, and set
  the team's sales region (map locks to it; unset = whole US)
- **Lead privacy** — status, notes, and customer info are visible only to the
  owning rep and managers; teammates see neutral pins and trails
- **Dashboard** — post-login home with KPI cards (doors/hot/miles today),
  a static-map preview of recent activity, and the team roster
- **History** — month calendar badged with route counts per day; tap a line on
  the map to replay that day's visits

## Stack

| Layer     | Tech                                                        |
| --------- | ----------------------------------------------------------- |
| Frontend  | React + Vite, Mapbox GL JS                                  |
| Backend   | Supabase (Postgres, auth, row-level security, realtime)     |
| Native    | Capacitor iOS shell; Transistorsoft background-geolocation; |
|           | Capgo speech-recognition                                    |
| Web host  | Vercel                                                      |
| iOS CI    | Codemagic (`codemagic.yaml`) → App Store Connect/TestFlight |

## Local development

```sh
npm install
cp .env.example .env   # then fill in the values below
npm run dev
```

`.env` values:

| Variable                 | Where it comes from                              |
| ------------------------ | ------------------------------------------------ |
| `VITE_MAPBOX_TOKEN`      | Mapbox account → public token (`pk.…`)           |
| `VITE_SUPABASE_URL`      | Supabase project → Settings → API                |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable key (`sb_publishable_…`)    |

### Database

Run the SQL files in `supabase/` against the project's SQL editor, in order:
`schema.sql`, then each `migration-N-*.sql`. Also disable
**Authentication → Email → Confirm email** (signup is join-code gated instead).

## Deploying

**Web** — auto-deploys on every push to `master` via Vercel's GitHub
integration. `git push` is the whole deploy step; no CLI needed, no local
build required. (A manual `vercel deploy --prod --yes` still works too, e.g.
to preview before pushing.)

**iOS** — push to `master`, then start the `ios-testflight` workflow in
Codemagic. Signing uses stored code-signing identities (certificate ref
`breadcrumbs`, profile ref `breadcrumbs_app_store`); publishing uses the App
Store Connect key integration named `breadcrumbs`. Builds land in TestFlight
automatically. After changing web code, `npx cap sync ios` before committing
so the native shell picks it up.

## Project layout

```
src/
  App.jsx         map screen, panels, data layer (Supabase CRUD)
  Dashboard.jsx   post-login home: KPIs, map preview, roster
  Auth.jsx        login / signup with create-or-join team
  Landing.jsx     logged-out marketing page
  Root.jsx        session + profile gating
  tracking.js     GPS engine switch: Transistorsoft (native) / watchPosition (web)
  dictation.js    voice-to-text: native speech engine / Web Speech API
  supabase.js     client init
supabase/         schema + numbered migrations (run manually, in order)
ios/              Capacitor iOS project (built by Codemagic)
codemagic.yaml    iOS build + TestFlight pipeline
```
