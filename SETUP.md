# Putting Here To Serve online

## Status (23 Oct 2026)
Done: domain heretoserve.app bought; Supabase project `here-to-serve` (Pro org, Micro, East US Ohio) created; its URL and public key are in `config.json`; the code, database file, server functions, phone app projects and workflows are written and tested.
Still to do: the steps below, in order. Steps 1–5 put the website and Pinewood pilot online (about an hour). Step 6 turns on Planning Center. Step 7 is the App Store. After this, every change Claude makes goes live on its own when it's merged.

## 1. Code (GitHub)
1. Create a new **public** repo named **here-to-serve** under your account (empty: no README). GitHub Pages on a free account needs a public repo. Everything in it already ships to every visitor's browser, so public exposes nothing new. No secrets live in the code.
2. Tell Claude the repo is ready. Claude pushes the code.
3. In the repo, open **Settings**, then **Pages**, and set **Source** to **GitHub Actions**. Under **Custom domain** enter `heretoserve.app`, select **Save**, then check **Enforce HTTPS** once it's offered.

## 2. Database (Supabase)
1. Open the **here-to-serve** project, then **SQL Editor**, **New query**. Paste everything in `supabase/setup.sql` and select **Run**. (After step 3, GitHub runs it for you on every update.)
2. **Authentication**, then **URL Configuration**: set **Site URL** to `https://heretoserve.app` and add `https://heretoserve.app/**` under **Redirect URLs**.
3. **Authentication**, then **Emails**, then **Magic Link** template: make sure the email shows the 6-digit code too (add `{{ .Token }}`), so staff can sign in inside the phone app by typing the code.
4. Later, when you set up Resend for heretoserve.app: **Authentication**, **Emails**, **SMTP Settings**, host `smtp.resend.com`, port `465`, user `resend`, password = the Resend API key, sender `hello@heretoserve.app`, name "Here To Serve". Resend's free plan allows 3 domains, so this costs nothing.

## 3. Secrets (GitHub)
Repo **Settings**, then **Secrets and variables**, then **Actions**. Add these. Each one turns on a piece; anything left blank is skipped, not broken.

| Kind | Name | Where to find it | Turns on |
|---|---|---|---|
| Secret | `SUPABASE_DB_URL` | Supabase: **Connect**, **Session pooler** connection string, with your database password filled in (reset it under **Project Settings**, **Database** if you didn't keep it) | Database updates on every merge |
| Secret | `SUPABASE_ACCESS_TOKEN` | supabase.com: **Account**, **Access Tokens**, **Generate** | Server functions deploy |
| Variable | `SUPABASE_PROJECT_REF` | `lfeypyanuqagvuuqothd` | Server functions and the 15-minute job |
| Variable | `SITE_URL` | `https://heretoserve.app` | Links in redirects |
| Secret | `CRON_SECRET` | Make one up: 40+ random letters and numbers | The 15-minute Planning Center sync and staff notifications |

## 4. Point the domain (Namecheap)
**Domain List**, heretoserve.app, **Advanced DNS**. Delete the parking records and add:

| Type | Host | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | parkermanuel.github.io. |

`.app` domains only work over HTTPS, which GitHub Pages provides once the domain checks out (can take up to an hour).

## 5. Set up Pinewood and make yourself the platform admin
1. Go to heretoserve.app, sign in with parker@parkermanuel.com, and create **Pinewood Church**. You're its Administrator.
2. **Settings**: add the logo link and color. Under **What we believe**, select **Fill with Pinewood's**, then **Save beliefs** (condensed from the bylaws; communion for every believer).
3. **Settings**, **Team**: invite Jess and staff as Administrator or Staff; invite team leads as **Team Lead** with their team(s). Prayer access is on by default for Administrator and Staff; turn it on for prayer team members at any level. Copy each invite link and send it.
4. In the Supabase SQL Editor, run this once so you can see platform-wide counts (never anyone's answers):
```
insert into public.platform_admins select id from auth.users where email = 'parker@parkermanuel.com';
```
5. Try it: **Classes**, create a class, scan the QR code with your phone, and go through it. Watch it land on **Today**.

## 6. Planning Center
One-time, about 15 minutes. After this, any church's Administrator connects their own Planning Center from Settings.
1. Go to **api.planningcenteronline.com**, sign in with the Pinewood Planning Center account, open **OAuth applications**, and create a new application:
   - Name: **Here To Serve**
   - Redirect URI: `https://lfeypyanuqagvuuqothd.supabase.co/functions/v1/hts-pco-callback`
   - Scopes: **People** and **Services**
2. Copy the **Client ID** into `config.json` as `pcoClientId` (Claude can do this; it's public) and into GitHub as a **variable** `PCO_CLIENT_ID`.
3. Copy the **Secret** into GitHub as a **secret** `PCO_CLIENT_SECRET`. Never paste it anywhere else.
4. Merge any change (or run the **Deploy** workflow) so the functions get the new secrets.
5. Claude: confirm the few addresses marked **CONFIRM** in `supabase/functions/_shared/pco-constants.js` against Planning Center's docs with one test call on Pinewood's account.
6. In Here To Serve: **Settings**, **Connect Planning Center**, approve. Then **Sync now**, and match each Services team to a Here To Serve team. Unmatched teams are ignored.

What it does: every 15 minutes, people who finished class (or whose gifts or team a leader changed) go to Planning Center People. It finds them by email first, then name and phone, before creating anyone new. It fills a **Here To Serve** tab (Top gifts, Team, Membership, First Sunday) and adds one note with their decision and commitment date. Services teams and their people come back, so the snapshot's "serving now" is real. It paces itself under Planning Center's limit (about 100 requests per 20 seconds) and waits when asked to. **Settings** shows each run and any errors.

## 7. Phone app (App Store)
White label in the store means one app named **Here To Serve**. Anyone can download it; the church's name, logo and color load once they scan their class code or a staff member signs in.

The app is the same code as the website, wrapped with Capacitor, plus phone features Apple looks for: a camera QR scanner to join a class, push notifications for staff (someone finished class, a next step is overdue), offline-safe saving, and in-app account deletion.

### One-time, in your Apple Developer account (developer.apple.com)
1. **Identifiers**, **+**, **App IDs**: Bundle ID `app.heretoserve`, description "Here To Serve". Turn on **Push Notifications** and **Associated Domains**.
2. **Keys**, **+**: name "Here To Serve push", check **Apple Push Notifications service (APNs)**. Download the `.p8` file (only once). Note the **Key ID** and your **Team ID** (top right of the page).
3. In GitHub add: secret `APNS_KEY_P8` (the whole .p8 file's text), variable `APNS_KEY_ID`, variable `APPLE_TEAM_ID`. Tell Claude your Team ID so it goes in `config.json` as `appleTeamId` (this turns on links that open the app).
4. **App Store Connect** (appstoreconnect.apple.com), **Apps**, **+**, **New App**: iOS, name **Here To Serve**, bundle ID `app.heretoserve`, SKU `heretoserve`.
5. **Users and Access**, **Integrations**, **App Store Connect API**, **+**: name "GitHub builds", access **App Manager**. Download the key (once). In GitHub add: secret `ASC_KEY_P8` (the file's text), variable `ASC_KEY_ID`, variable `ASC_ISSUER_ID` (shown above the keys list).

### Each release
1. In GitHub, **Actions**, **iPhone app to TestFlight**, **Run workflow** (or push a tag like `v1.0.0`). It builds on a Mac in the cloud, signs and uploads. No Mac needed.
2. In App Store Connect, **TestFlight**: add yourself and a few staff as testers. Try joining a class with the scanner, signing in with the emailed code, notifications and deleting a test account.
3. Fill in the App Store listing (below), select the build, and **Submit for Review**.

### App Store listing answers
- **Privacy Policy URL**: `https://heretoserve.app/#/privacy`. Support URL: `https://heretoserve.app`.
- **Age rating**: 4+ (no objectionable content). Members must be 18+ to take a class; the app asks them to confirm.
- **Sign-in for review**: create a test church and a Staff account for Apple, and paste this in **Review Notes**: "Church members don't need an account: they scan their church's class QR code (test code: [paste a class link]). Staff sign in with an emailed 6-digit code; use [test email], and we'll watch that inbox during review. Account deletion: Account, Delete my account."
- **App Privacy (the "nutrition label")**. Tracking: **No**. Data collected, all **linked to the user**, all used only for **App Functionality**, none for tracking or ads:
  - Contact Info: **Name**, **Email Address**, **Phone Number**
  - Sensitive Info: **Yes** (faith and baptism steps count as religious beliefs)
  - User Content: **Other User Content** (class answers, prayer requests, leader notes)
  - Identifiers: **User ID** (staff accounts)
  - Not collected: location, contacts, health, financial info, browsing history, purchases, usage data, diagnostics, advertising data.

### Before you submit
- [ ] Replace the placeholder icon and splash (`scripts/make-icons.py` makes the current ones) with designed art
- [ ] A lawyer reads Privacy and Terms (`src/pages.js`); the contact address there is hello@parkermanuel.com, change it if you'd rather use another
- [ ] TestFlight run-through above passes on a real iPhone
- [ ] Apple review account and test class code are in the Review Notes

### Android (optional, later)
The Android project is in `android/`. To publish: a Google Play developer account ($25 once), then build with Android Studio. Push notifications on Android also need a free Firebase project (`google-services.json`); until then the app hides the notifications button on Android.

## Who sees what
- **Administrator**: everything for their church, including settings, Planning Center and the team.
- **Staff**: every person's card, notes, gift and team edits, next steps, classes, snapshot. No settings or team changes.
- **Team Lead**: their own team(s) only: name, contact, top gifts and availability of people headed there; first Sundays; steps assigned to them. During a class they're added to (while it's open), they can see that class's people and add notes or adjust gifts and team.
- **Prayer requests**: only people with prayer access.
- **Planning Center tokens**: no one. Only the server functions read them.
