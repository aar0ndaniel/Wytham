# Wytham Landing Page Deployment

## Services

- Frontend: Vercel
- Backend: Railway
- Database: Supabase

## Branches

- `main`: working integration branch
- `deploy/frontend`: Vercel release branch
- `deploy/backend`: Railway release branch

## Backend env mapping

- `padi`: Supabase URL
- `tsotso`: Supabase project ref
- `amenya`: Supabase publishable key
- `Tarkitey`: Supabase secret key
- `SUPABASE_DB_SCHEMA`: schema name

## Release pattern

1. Work in `main`
2. Promote frontend-ready commits into `deploy/frontend`
3. Promote backend-ready commits into `deploy/backend`
