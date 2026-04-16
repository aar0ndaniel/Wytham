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
- `API_BASE_URL`: Railway backend base URL
- `padi`, `tsotso`, `amenya`: optional client-safe Supabase values only if direct browser reads are introduced later

## Release pattern

1. Work in `main`
2. Cherry-pick frontend-ready commits into `deploy/frontend`
3. Cherry-pick backend-ready commits into `deploy/backend`
