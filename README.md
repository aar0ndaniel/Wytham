# Wytham Beta Backend

This backend now supports the hosted single-port shape used by Railway-style deployments.

- `node server.js` starts one Express app on `HOST:PORT`
- signups are written as `pending` records only
- beta emails are sent manually from the admin dashboard
- the hosted path uses the store abstraction instead of direct route-level SQLite queries

This branch is backend-only, so Railway can point directly at the branch root without carrying the public landing-page files.

## What it does

- receives beta signup submissions from the landing page
- stores signups in Supabase through `lib/store.js` when hosted config is present
- falls back to the local SQLite adapter when Supabase admin env vars are missing
- keeps new signups pending until an admin manually sends the beta email
- creates a private beta page for each signup
- routes Lite and Bundle users to the correct OneDrive folder
- provides the admin dashboard on the same server under `/admin`

## Setup

1. Copy `.env.example` to `.env`
2. Update these values:
   - `PUBLIC_BASE_URL`
   - `ADMIN_PASSWORD`
   - `HEALTH_TOKEN`
   - `SMTP_*`
   - `SUPPORT_EMAIL`
   - hosted store env vars if you want Supabase-backed mode:
     - `padi`
     - `Tarkitey`
     - optional: `SUPABASE_DB_SCHEMA`
3. Run:

```bash
npm install
npm start
```

The public app listens on `127.0.0.1:8787` by default.
The hosted admin dashboard is served from the same process at `/admin`.

## Admin Dashboard

The dashboard is available at:

```text
http://127.0.0.1:8787/admin
```

It requires the configured username and password:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

### Manual email workflow

`POST /api/signup` does not send email anymore. It only stores or refreshes the signup row as `pending`.

From `/admin` you can now:

- send one pending/failed signup with the row-level `Send` button
- send multiple selected rows with `Send selected`
- skip rows already marked `sent`

If SMTP is missing, a manual send marks the row as:

```json
{ "status": "failed", "error": "SMTP not configured.", "sentAt": "" }
```

## Email Sender

Use a dedicated mailbox for this, not your personal daily email. Good options:

- a dedicated Gmail account with an App Password
- a dedicated Outlook account with app credentials

The sender fills `./assets/signup-beta-email-template.html` and attaches `./assets/wytham-logo-dark-nav.png` inline in the email.

## Downloads

This backend does not serve installers directly. Each beta page points users to the correct OneDrive folder:

- Lite: `LITE_SHARE_URL`
- Bundle: `BUNDLE_SHARE_URL`

## Security Notes

- The signup API no longer returns the beta page URL directly.
- Signup emails are manual admin actions, not automatic side effects of `/api/signup`.
- The public `/health` route returns only `{ ok: true }` unless you provide the correct `HEALTH_TOKEN`.
- The old dual-port local listener still exists as a fallback through `startServers()`, but `npm start` now uses the hosted-ready single-port path.
