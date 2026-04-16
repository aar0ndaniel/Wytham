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
