# Wytham Beta Backend

This backend now supports the hosted single-port shape used by Railway-style deployments.

- `node server.js` starts one Express app on `HOST:PORT`
- signups are written as `pending` records only
- beta emails are sent manually from the admin dashboard
- the hosted path uses the store abstraction instead of direct route-level SQLite queries

## What it does

- receives beta signup submissions from the landing page
- stores signups in Supabase through `lib/store.js` when hosted config is present
- falls back to the local SQLite adapter when Supabase admin env vars are missing
- keeps new signups pending until an admin manually sends the beta email
- creates a private beta page for each signup
- routes Lite and Bundle users through a private tokenized backend download link before redirecting to OneDrive
- provides the admin dashboard on the same server under `/admin`

## Setup

1. Create a local `.env` file or set these values in Railway:
   - `PUBLIC_BASE_URL`
   - `ADMIN_PASSWORD`
   - `HEALTH_TOKEN`
   - `RESEND_API_KEY` plus sender values, or `SMTP_*` if you intentionally use SMTP
   - `SUPPORT_EMAIL`
   - hosted store env vars if you want Supabase-backed mode:
     - `padi`
     - `Tarkitey`
     - optional: `SUPABASE_DB_SCHEMA`
2. Run:

```bash
npm install
npm start
```

The public app listens on `127.0.0.1:8787` by default.
The hosted admin dashboard is served from the same process at `/admin`.

## Railway

Deploy the backend service from the flattened backend branch:

- Repository: `aar0ndaniel/Wytham`
- Branch: `backend`
- Root directory: leave blank or use `.`
- Start command: `node server.js`
- Healthcheck path: `/health`

Do not set the Railway root directory to `backend`; this branch already has the backend files at the repository root.

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

If email delivery is missing, a manual send marks the row as failed:

```json
{ "status": "failed", "error": "SMTP not configured.", "sentAt": "" }
```

## Email Sender

Use a dedicated sender for this, not your personal daily email. The preferred production path is Resend HTTP:

- `RESEND_API_KEY`
- `SMTP_FROM_EMAIL` or `RESEND_FROM_EMAIL`
- `SMTP_FROM_NAME` or `RESEND_FROM_NAME`
- `SUPPORT_EMAIL`

SMTP remains as a fallback for environments that allow outbound SMTP ports. The sender fills `signup-beta-email-template.html`; Resend HTTP uses the public logo URL, and SMTP attaches the local logo inline.

If Resend accepts a message but Gmail does not show it while institutional mail does, treat that as a deliverability issue rather than an SMTP port issue. Check Resend logs/events and confirm the sender domain passes SPF, DKIM, and DMARC.

## Downloads

This backend does not serve installers directly. Put each installer in OneDrive, create a direct file sharing URL, and configure:

- Lite: `LITE_SHARE_URL`
- Bundle: `BUNDLE_SHARE_URL`

The email button points to `/beta/:token`, not directly to OneDrive. The beta page validates the tester token, records access, and its download button redirects through `/download/:token` to the correct OneDrive file URL.

## Security Notes

- The signup API no longer returns the beta page URL directly.
- Signup emails are manual admin actions, not automatic side effects of `/api/signup`.
- The public `/health` route returns only `{ ok: true }` unless you provide the correct `HEALTH_TOKEN`.
- The old dual-port local listener still exists as a fallback through `startServers()`, but `npm start` now uses the hosted-ready single-port path.
