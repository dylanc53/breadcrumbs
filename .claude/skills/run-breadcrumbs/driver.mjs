// Breadcrumbs smoke driver: launches headless Chrome against a running
// dev server (or the production URL), walks the real user flow —
// landing → login → dashboard → map — and drops screenshots.
//
// Usage:
//   node .claude/skills/run-breadcrumbs/driver.mjs [baseUrl] [outDir]
//
// Defaults: baseUrl http://localhost:5173, outDir .claude/skills/run-breadcrumbs/shots
// Login uses BREADCRUMBS_TEST_EMAIL / BREADCRUMBS_TEST_PASSWORD env vars,
// falling back to the committed smoke-test account (isolated "Smoke Test"
// org — not Dylan's real team).

import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const baseUrl = process.argv[2] ?? 'http://localhost:5173'
const outDir = process.argv[3] ?? '.claude/skills/run-breadcrumbs/shots'
const email = process.env.BREADCRUMBS_TEST_EMAIL ?? 'dylancraig53+smoke@gmail.com'
const password = process.env.BREADCRUMBS_TEST_PASSWORD ?? 'smoke-test-2026!'

mkdirSync(outDir, { recursive: true })
const shot = (page, name) =>
  page.screenshot({ path: `${outDir}/${name}.png`, fullPage: false })

let failed = false
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failed = true
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }) // iPhone-ish

try {
  // 1. Landing page
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  check(await page.getByText('Know every door').isVisible(), 'landing page renders')
  await shot(page, '01-landing')

  // 2. Login screen
  await page.getByRole('button', { name: 'Log in' }).first().click()
  await page.waitForSelector('input[type="email"]')
  await shot(page, '02-login')

  // 3. Log in as the smoke-test account
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.getByRole('button', { name: /log in/i }).click()

  // 4. Dashboard (post-login home)
  await page.waitForSelector('.dash-brand', { timeout: 15000 })
  check(true, 'login → dashboard')
  await shot(page, '03-dashboard')

  // 5. Map (satellite tiles need a beat to fetch)
  await page.click('.map-preview')
  await page.waitForSelector('.bottom-bar', { timeout: 15000 })
  await page.waitForTimeout(4000)
  check(await page.getByText('Start selling').isVisible(), 'map screen + bottom bar')
  await shot(page, '04-map')

  // 6. Tap the map → visit form sheet (address lookup runs)
  await page.mouse.click(195, 400)
  await page.waitForSelector('.sheet', { timeout: 10000 })
  await page.waitForTimeout(2500)
  check(await page.getByText('Save visit').isVisible(), 'visit form opens on map tap')
  await shot(page, '05-visit-form')
  await page.getByRole('button', { name: 'Cancel' }).click()
} catch (err) {
  failed = true
  console.error('DRIVER ERROR:', err.message)
  await shot(page, '99-failure')
} finally {
  await browser.close()
}

console.log(failed ? '\nSMOKE: FAILED' : '\nSMOKE: OK')
process.exit(failed ? 1 : 0)
