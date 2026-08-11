// Renders the Breadcrumbs app icon at every size the project needs by
// screenshotting an SVG in headless Chrome (no image libraries required).
//
//   node .claude/skills/run-breadcrumbs/make-icon.mjs
//
// Writes: ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
//         public/icon-512.png, public/icon-192.png, public/favicon.svg

import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

// A breadcrumb trail of dots leading to a map pin, on a purple field.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#5b21b6"/>
    </linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#2e1065" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g fill="#ffffff" opacity="0.92" filter="url(#soft)">
    <circle cx="126" cy="404" r="15"/>
    <circle cx="176" cy="366" r="18"/>
    <circle cx="216" cy="316" r="21"/>
    <circle cx="240" cy="258" r="24"/>
  </g>
  <g filter="url(#soft)">
    <path d="M316 92c-51 0-92 41-92 92 0 66 82 143 88 149a6 6 0 0 0 8 0c6-6 88-83 88-149 0-51-41-92-92-92z"
          fill="#ffffff"/>
    <circle cx="316" cy="182" r="36" fill="#f59e0b"/>
  </g>
</svg>`

const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function render(size, path) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
  })
  await page.setContent(
    `<body style="margin:0">${svg.replace('viewBox', `width="${size}" height="${size}" viewBox`)}</body>`
  )
  await page.screenshot({ path, omitBackground: false })
  await page.close()
  console.log(`wrote ${path} (${size}px)`)
}

await render(
  1024,
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
)
await render(512, 'public/icon-512.png')
await render(192, 'public/icon-192.png')
writeFileSync('public/favicon.svg', svg)
console.log('wrote public/favicon.svg')

await browser.close()
