# App Store submission guide

Everything needed to fill out the App Store Connect listing for
**Breadcrumbs Canvassing** (`com.customremodeling.breadcrumbs`, Apple ID
6799608013). Copy-paste the blocks below into the matching fields.

Assets are generated, not stored in git:

```powershell
node .claude/skills/run-breadcrumbs/seed-demo.mjs     # demo data
node .claude/skills/run-breadcrumbs/store-shots.mjs   # store-shots/*.png (1320x2868)
node .claude/skills/run-breadcrumbs/make-icon.mjs     # app icon (already in the iOS project)
```

---

## 1. App Information

**Name** (30 char max)

```
Breadcrumbs Canvassing
```

**Subtitle** (30 char max)

```
Door-to-door sales tracking
```

**Category** — Primary: Business · Secondary: Productivity

**Age rating** — answer No to every content question → results in 4+.

**Privacy Policy URL**

```
https://breadcrumbs-blue-zeta.vercel.app/privacy.html
```

**Support URL**

```
https://breadcrumbs-blue-zeta.vercel.app/support.html
```

---

## 2. Description

```
Breadcrumbs is the canvassing map for door-to-door sales teams. Drop a pin at
every door you knock, tag the conversation Cold, Warm, or Hot, and watch your
walking route draw itself behind you — so nobody on your team ever knocks the
same house twice.

BUILT FOR THE DOORSTEP
• Tap the house you're standing at and the street address fills itself in
• Mark every lead Cold, Warm, or Hot with one tap
• Dictate your notes by voice instead of typing on a porch
• Save the customer's name, phone, and email while it's fresh
• Flag a door for a revisit and find it again instantly

ROUTES THAT DRAW THEMSELVES
• Hit Start Selling and your route records as you walk — screen off, phone in
  your pocket
• Tap any day's trail to replay every conversation you had on it
• A calendar shows exactly which days you worked and how many routes you ran

YOUR WHOLE TEAM, ONE MAP
• See where teammates have already covered so you never double-knock
• Your lead notes and customer details stay private to you and your manager
• Watch the team work in real time while selling sessions are running
• Managers get team totals, per-rep activity, and a coverage map

SET YOUR TERRITORY
• Draw your sales region to any city, county, or zip
• Everyone on the team opens the map on the same turf

Breadcrumbs works on iPhone and in any web browser, so reps can knock doors
while managers review coverage from a laptop. Start a team in under a minute
and invite your reps with a join code.
```

**Keywords** (100 char max, comma-separated)

```
canvassing,door to door,sales,knocking,leads,route tracker,field sales,territory,pin map,crm
```

**Promotional text** (170 char max, editable without review)

```
Log every door, track every route, and see your whole team's coverage on one map. Built for door-to-door sales crews who don't want to knock the same house twice.
```

---

## 3. Screenshots

Upload from `store-shots/` (1320 × 2868 — the 6.9" size Apple requires; it
scales these down for other devices automatically). Suggested order and
captions if you add them:

| File | Caption |
| --- | --- |
| `1-dashboard.png` | Your day at a glance |
| `2-map.png` | Every door, every route |
| `3-visit.png` | Log the lead in seconds |
| `4-history.png` | Replay any day you worked |
| `5-team.png` | See the whole team's coverage |

---

## 4. App Privacy questionnaire

App Store Connect → App Privacy → "Yes, we collect data." Declare:

| Data type | Collected | Linked to user | Used for tracking | Purpose |
| --- | --- | --- | --- | --- |
| Precise Location | Yes | Yes | No | App Functionality |
| Name | Yes | Yes | No | App Functionality |
| Email Address | Yes | Yes | No | App Functionality |
| Phone Number | Yes | Yes | No | App Functionality |
| Other User Content (notes) | Yes | Yes | No | App Functionality |
| User ID | Yes | Yes | No | App Functionality |

Answer **No** to "Do you or your third-party partners use data for tracking?"
— nothing here feeds advertising or cross-app tracking.

Note: name/email/phone covers both the rep's own account *and* the customer
contact details reps type into visit notes.

---

## 5. Review notes (paste into "Notes" on the submission)

```
Breadcrumbs is a tool for door-to-door sales teams. Reps log the houses they
visit and their manager sees the team's coverage on a shared map.

SIGN-IN REQUIRED — demo account:
  Email:    dylancraig53+smoke@gmail.com
  Password: smoke-test-2026!
This account is preloaded with a sample route and nine sample visits in
Southaven, Mississippi, so the map, history calendar, and team views all have
data to display. To see the team features, open the menu (top left) and choose
Team.

BACKGROUND LOCATION USE:
The app records the rep's walking route so their employer can see which streets
have been canvassed. Background location is used ONLY while the user has
explicitly started a selling session by tapping "Start selling," and it stops
immediately when they tap "Stop." No location is collected at any other time.
The iOS background location indicator is enabled and remains visible during a
session. The purpose strings in Info.plist describe this, and the privacy
policy at https://breadcrumbs-blue-zeta.vercel.app/privacy.html explains what
is recorded and who can see it.

To test route recording: log in, tap "Open map," tap "Start selling," and the
map begins recording. Tapping "Stop" ends the session and saves the route.
Note that in the simulator with a static location, the route will be a single
point.

The microphone/speech recognition permission is used for optional voice
dictation of visit notes (the mic button beside the note field).
```

---

## 6. Version release + submit

- **Version** 1.0, **Copyright** `2026 Dylan Craig`
- Build: start the `ios-testflight` workflow in Codemagic, wait for the build
  to appear under TestFlight, then select it on the App Store tab.
- Export compliance is pre-answered by `ITSAppUsesNonExemptEncryption=false`
  in `Info.plist` — no prompt.
- Choose "Manually release this version" so you control the go-live moment.
- Submit for Review. Typical turnaround is 24–48 hours.

## Likely rejection reasons and how to answer

| If Apple says | Response |
| --- | --- |
| Guideline 5.1.5 — background location isn't justified | Point at the review note above: session-scoped, user-initiated, indicator visible, disclosed in-app and in the policy. Offer to add an in-app consent screen if they want it more explicit. |
| Guideline 2.1 — can't access the app | Re-confirm the demo credentials; check the account still exists in Supabase → Authentication → Users. |
| Guideline 5.1.1 — privacy policy incomplete | The policy already covers collection, sharing, retention, deletion, and third parties; ask which specific element is missing. |
| Guideline 4.2 — minimum functionality | Emphasize it's a full field-sales tool (mapping, routing, CRM records, team coordination), not a repackaged website. |
