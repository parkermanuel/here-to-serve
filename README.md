# Here To Serve

Membership class, gifts and next steps for churches. People scan a QR code in class and fill it out on their phones. Staff get a dashboard: who finished, their top gifts and recommended teams, a next steps checklist, prayer requests and a church snapshot. White labeled: each church sees its own name, logo and color.

## How it's built
- A static single-page app in `src/` that esbuild bundles into `dist/index.html`, hosted on GitHub Pages at heretoserve.app.
- The same `dist/` runs inside the iPhone and Android apps (Capacitor), so there's one codebase. The apps add a camera QR scanner, push notifications for staff and offline-safe saving.
- Supabase handles staff sign-in (email link, or a 6-digit code in the app) and Postgres storage. `supabase/setup.sql` creates every table, security rule and function, and is safe to run again.
- Members don't need accounts. Scanning the class code gives their phone a random 64-character key, and they reach only their own form through `hts_*` functions.
- Connections: a church connects one people system, Planning Center (OAuth) or Breeze (subdomain + API key), behind one shared interface (`_shared/connectors.js`). Server functions push new members and pull teams (Services teams or Breeze tags). Tokens and keys never reach a browser.
- Spreadsheets: Administrators and Staff export people and next steps as CSV; Administrators import team rosters from a CSV with a preview and team-matching step. All through `hts_*` functions.

## Access levels
| Level | Can do |
|---|---|
| Administrator | Everything: settings, white label, beliefs, connections, roster import, the team and their levels, deleting a person's data |
| Staff | Dashboard, everyone's cards, notes, gift/team edits, next steps, classes and QR codes, snapshot, spreadsheet export |
| Team Lead | Only their own team(s): the handoff list, first Sundays, steps assigned to them. One-on-ones for a class they're added to, while it's open |
| Prayer access | A separate switch for any level (on by default for Administrator and Staff) |

The database enforces all of this (row-level security and checks in each function), not just the screens.

## Files
| Path | What |
|---|---|
| `src/bank.js` | The 33 gift questions, 11 gifts, default teams, commitments, Pinewood's beliefs |
| `src/engine.js` | Scoring: gift counts, top 3, team matches, next steps. Pure functions |
| `src/app.js` | Screens: the member phone flow and the staff dashboard |
| `src/live.js` | Supabase: sign-in, saving, staff data, connections, export/import, devices |
| `src/csv.js` | Reading and writing spreadsheets (CSV), roster column detection |
| `src/native.js` | Phone app extras: QR scanner, push, app links |
| `src/pages.js` | Privacy and terms |
| `supabase/setup.sql` | Database, security rules and functions |
| `supabase/functions/` | Server functions: `hts-pco-callback`, `hts-connect` (Breeze, test), `hts-sync`, `hts-notify` |
| `supabase/functions/_shared/pco-constants.js`, `breeze-constants.js` | Every Planning Center and Breeze address the app uses (confirm the marked ones) |
| `ios/`, `android/` | The phone app projects (Capacitor) |
| `SETUP.md` | One-time steps to put it all online |

## Commands
```
npm ci
npm test            # scoring, CSV, Planning Center and Breeze (fake servers) and database checks (in-memory Postgres)
npm run build       # dist/index.html, using config.json
npx cap sync        # copy dist/ into the iPhone and Android projects
node test/flow.e2e.mjs   # browser walk-through of the member flow (needs Playwright)
node test/staff.e2e.mjs  # staff screens per level, export download and roster import
```

## Changing questions
Edit `src/bank.js` and `hts_pairs()` in `setup.sql` together, then run `npm test` (it checks they match). Never reuse a question number for different wording.
