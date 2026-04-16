# Wytham Landing Page Deployment

## Services

- Frontend: Vercel
- Backend: Railway
- Database: Supabase

## Branches

- `main`: working integration branch
- `deploy/frontend`: Vercel release branch
- `deploy/backend`: Railway release branch

These three branches intentionally start from the same initial commit. Promotion happens by cherry-picking release-ready commits from `main` into the deploy branches so each environment can advance independently.

## Backend env mapping

- `padi`: Supabase URL
- `tsotso`: Supabase project ref
- `amenya`: Supabase publishable key
- `Tarkitey`: Supabase secret key
- `SUPABASE_DB_SCHEMA`: schema name

## Frontend env mapping

- `PUBLIC_BASE_URL`: frontend canonical URL
- `padi`, `tsotso`, `amenya`: optional client-safe Supabase values only if direct browser reads are introduced later
- `turnstileSiteKey`: public Cloudflare Turnstile site key stored in `site-config.js`

The deployed frontend reads `window.WYTHAM_SITE_CONFIG.apiBase` from `site-config.js`, so keep the Railway backend URL there instead of baking it into `script.js`.

## Release pattern

1. Work in `main`
2. Cherry-pick frontend-ready commits into `deploy/frontend`
3. Cherry-pick backend-ready commits into `deploy/backend`

## Promoting Frontend Work

```bash
git checkout deploy/frontend
git cherry-pick "$(git log main --grep='^feat: add railway api config seam for vercel frontend$' --format=%H -n 1)"
git push origin deploy/frontend
```

## Promoting Backend Work

```bash
git checkout deploy/backend
git cherry-pick "$(git log main --grep='^feat: add hosted single-port manual signup flow$' --format=%H -n 1)"
git cherry-pick "$(git log main --grep='^test: stabilize hosted backend http coverage$' --format=%H -n 1)"
git push origin deploy/backend
```

## Vercel

- Connect the Vercel project to `deploy/frontend`
- Set the root directory to the repo root
- Keep secrets out of the frontend project

## Railway

- Connect the Railway service to `deploy/backend`
- Set the service root to `backend/`
- Add `padi`, `tsotso`, `amenya`, `Tarkitey`, `SUPABASE_DB_SCHEMA`, `TURNSTILE_SECRET_KEY`, SMTP vars, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `HEALTH_TOKEN`
