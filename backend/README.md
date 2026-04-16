# Wytham Beta Backend

> This file documents the current local backend flow. The approved deployment target is Railway + Supabase, and that migration is still pending.
>
> For the hosted deployment shape, deploy branches, and env mapping, use [../DEPLOYMENT.md](../DEPLOYMENT.md). Do not use the ngrok workflow below as the hosted deployment guide.

This backend is designed to run on your laptop and be exposed through `ngrok`, not by opening router ports directly.

## What it does

- receives beta signup submissions from the landing page
- stores signups in a local SQLite database file
- sends the newsletter email using your signup template
- creates a private beta page for each signup
- routes Lite and Bundle users to the correct OneDrive folder
- provides a local-only admin dashboard on a separate localhost-only port

## Setup

1. Copy `.env.example` to `.env`
2. Update these values:
   - `PUBLIC_BASE_URL`
   - `ADMIN_PORT` if you want a different local dashboard port
   - `ADMIN_PASSWORD`
   - `HEALTH_TOKEN`
   - `SMTP_*`
   - `SUPPORT_EMAIL`
3. Run:

```bash
npm install
npm start
```

The public app listens on `127.0.0.1:8787` by default.
The admin dashboard listens on `127.0.0.1:8788` by default.

## Ngrok

Once the public app is running locally, start ngrok against the public port only:

```bash
ngrok http 8787
```

Then copy the public `https://...ngrok-free.app` URL into:

- `PUBLIC_BASE_URL`
- `ALLOWED_ORIGINS`

Restart the backend after updating `.env`.

## Admin Dashboard

The dashboard is available only from this laptop and is not exposed through ngrok:

```text
http://127.0.0.1:8788/admin
```

It also requires HTTP Basic Auth using:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

## Email Sender

Use a dedicated mailbox for this, not your personal daily email. Good options:

- a dedicated Gmail account with an App Password
- a dedicated Outlook account with app credentials

The sender fills `../signup-beta-email-template.html` and attaches `../app-logo.png` inline in the email.

## Downloads

This backend does not serve installers from your laptop.

Instead, each beta page points users to the correct OneDrive folder:

- Lite: `LITE_SHARE_URL`
- Bundle: `BUNDLE_SHARE_URL`

That keeps your machine safer and reduces the risk of exposing local files.

## Security Notes

- The signup API no longer returns the beta page URL directly. Users get their access link through email only.
- The public `/health` route returns only `{ ok: true }` unless you provide the correct `HEALTH_TOKEN`.
- The admin dashboard and email preview live on the separate admin listener so they are not reachable through your ngrok public URL.
