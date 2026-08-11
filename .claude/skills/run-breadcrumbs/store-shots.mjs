// Captures App Store screenshots at the 6.9" iPhone size Apple requires
// (1320 x 2868). Run seed-demo.mjs first so the screens show real data.
//
//   node .claude/skills/run-breadcrumbs/store-shots.mjs [baseUrl]
//
// Writes to store-shots/ (gitignored).

import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const baseUrl = process.argv[2] ?? 'https://breadcrumbs-blue-zeta.vercel.app'
const outDir = 'store-shots'
const email = process.env.BREADCRUMBS_TEST_EMAIL ?? 'dylancraig53+smoke@gmail.com'
const password = process.env.BREADCRUMBS_TEST_PASSWORD ?? 'smoke-test-2026!'

mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({
  viewport: { width: 440, height: 956 }, // 6.9" logical size
  deviceScaleFactor: 3, // → 1320 x 2868
})
const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` })

await page.goto(baseUrl, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Log in' }).first().click()
await page.waitForSelector('input[type="email"]')
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', password)
await page.getByRole('button', { name: /log in/i }).click()
await page.waitForSelector('.dash-brand', { timeout: 20000 })
await page.waitForTimeout(3000)

// 1. Dashboard with real numbers
await shot('1-dashboard')

// 2. Map with pins and the route trail
await page.click('.map-preview')
await page.waitForSelector('.bottom-bar', { timeout: 20000 })
await page.waitForTimeout(6000)
await shot('2-map')

// 3. A logged visit with customer details. Pins overlap at this zoom and
// intercept each other's pointer events, so dispatch the click directly.
await page.locator('.pin-marker').first().dispatchEvent('click')
await page.waitForSelector('.sheet', { timeout: 10000 })
await page.waitForTimeout(1200)
await shot('3-visit')
await page.getByRole('button', { name: /cancel|close/i }).first().click()

// 4. Route history calendar
await page.getByRole('button', { name: /menu/i }).click()
await page.getByRole('button', { name: /history/i }).click()
await page.waitForSelector('.cal-grid', { timeout: 10000 })
await page.waitForTimeout(800)
await shot('4-history')
await page.getByRole('button', { name: /close/i }).first().click()

// 5. Team view picker
await page.getByRole('button', { name: /menu/i }).click()
await page.getByRole('button', { name: /team/i }).click()
await page.waitForSelector('.seg-row', { timeout: 10000 })
await page.waitForTimeout(800)
await shot('5-team')

await browser.close()
console.log(`5 screenshots written to ${outDir}/ at 1320x2868`)
