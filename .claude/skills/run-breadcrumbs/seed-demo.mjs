// Seeds the smoke-test account with realistic canvassing data so
// screenshots and manual QA show a working app instead of an empty map.
// Safe: writes only into the isolated "Smoke Test" org.
//
//   node .claude/skills/run-breadcrumbs/seed-demo.mjs
//
// Re-running wipes the account's previous demo data first.

import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
)
const SUPABASE = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const MAPBOX = env.VITE_MAPBOX_TOKEN
const EMAIL = process.env.BREADCRUMBS_TEST_EMAIL ?? 'dylancraig53+smoke@gmail.com'
const PASSWORD = process.env.BREADCRUMBS_TEST_PASSWORD ?? 'smoke-test-2026!'

const auth = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then((r) => r.json())

const token = auth.access_token
if (!token) throw new Error(`login failed: ${JSON.stringify(auth)}`)
const H = {
  apikey: ANON,
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
}
const db = (path, init) => fetch(`${SUPABASE}/rest/v1/${path}`, { headers: H, ...init })

const [profile] = await db(`profiles?id=eq.${auth.user.id}&select=*`).then((r) => r.json())
const { id: repId, org_id: orgId } = profile

// Fresh start
await db(`visits?rep_id=eq.${repId}`, { method: 'DELETE' })
await db(`routes?rep_id=eq.${repId}`, { method: 'DELETE' })

// A realistic name so pin initials read like a real rep in screenshots
await db(`profiles?id=eq.${repId}`, {
  method: 'PATCH',
  body: JSON.stringify({ name: 'Ray Mitchell' }),
})

// Company name and a neighborhood-tight territory, so the map opens on
// the walked streets (pins and trail legible) rather than a metro blob
await db(`orgs?id=eq.${orgId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    name: 'Mitchell Exteriors',
    region: {
      name: 'Southaven, MS',
      bounds: [
        [-90.0, 34.9735],
        [-89.9865, 34.988],
      ],
    },
  }),
})

// A morning's walk through a Southaven neighborhood
const start = { lat: 34.9755, lng: -89.9968 }
const path = []
const t0 = Date.now() - 3 * 60 * 60 * 1000
for (let i = 0; i < 60; i++) {
  path.push({
    lat: start.lat + i * 0.00018 + (i % 7) * 0.000015,
    lng: start.lng + i * 0.00012 + (i % 5) * 0.00002,
    t: new Date(t0 + i * 3 * 60 * 1000).toISOString(),
  })
}

const [route] = await db('routes', {
  method: 'POST',
  headers: { ...H, prefer: 'return=representation' },
  body: JSON.stringify({
    org_id: orgId,
    rep_id: repId,
    started_at: path[0].t,
    ended_at: path[path.length - 1].t,
    path,
  }),
}).then((r) => r.json())

const script = [
  { i: 4, status: 'hot', name: 'Marcus Webb', phone: '(901) 555-0148', note: 'Roof damage from the spring storm — wants an estimate Thursday morning. Ask for Marcus.', follow: true },
  { i: 11, status: 'cold', note: 'Not interested, just replaced the roof last year.' },
  { i: 17, status: 'warm', name: 'Diane Kessler', phone: '(662) 555-0192', note: 'Interested but waiting on her husband. Said to swing back this weekend.', follow: true },
  { i: 23, status: 'cold', note: 'No answer, no car in the driveway.' },
  { i: 29, status: 'hot', name: 'Tom Alvarez', phone: '(901) 555-0177', note: 'Gutters falling off the back of the house. Ready to sign, wants a quote emailed.' },
  { i: 36, status: 'warm', note: 'Renter — gave me the landlord contact, following up.' },
  { i: 42, status: 'cold', note: 'Dog in the yard, left a door hanger.' },
  { i: 48, status: 'warm', name: 'Priya Raman', note: 'Curious about siding. Wants pricing before committing to a walkthrough.', follow: true },
  { i: 55, status: 'hot', name: 'Jerry Cobb', phone: '(662) 555-0133', note: 'Neighbor referral. Storm damage on two sides, insurance claim already open.' },
]

for (const s of script) {
  const p = path[s.i]
  let geo = {}
  try {
    const res = await fetch(
      `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${p.lng}&latitude=${p.lat}&types=address&access_token=${MAPBOX}`
    ).then((r) => r.json())
    const f = res.features?.[0]
    if (f) {
      const ctx = f.properties.context ?? {}
      geo = {
        address: f.properties.full_address ?? f.properties.name,
        neighborhood: ctx.neighborhood?.name ?? null,
        city: ctx.place?.name ?? null,
        zip: ctx.postcode?.name ?? null,
      }
    }
  } catch {
    /* leave address null */
  }
  await db('visits', {
    method: 'POST',
    body: JSON.stringify({
      org_id: orgId,
      rep_id: repId,
      route_id: route.id,
      lat: p.lat,
      lng: p.lng,
      status: s.status,
      note: s.note,
      customer_name: s.name ?? null,
      customer_phone: s.phone ?? null,
      follow_up: !!s.follow,
      created_at: p.t,
      ...geo,
    }),
  })
}

console.log(`seeded 1 route (${path.length} points) + ${script.length} visits`)
