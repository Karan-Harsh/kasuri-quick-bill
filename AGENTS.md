# Kasuri Quick Bill

Simple restaurant POS: 8 tables, parcel orders, GST billing, receipts, and sales reports.

## Stack

- TanStack Start + React + TypeScript
- Supabase (Postgres, Auth, RLS)
- Tailwind CSS + shadcn/ui

## Conventions

- Routes live in `src/routes/` (file-based TanStack Router). Do not add Next.js-style `pages/`.
- Business logic for totals and formatting: `src/lib/kasuri.ts`
- Database schema changes: add SQL files under `supabase/migrations/`, then run `supabase db push`
- Env vars: copy `.env.example` to `.env` (never commit `.env`)

## Roles

- First signed-up user becomes `admin` (menu edits); later users are `cashiers`
- Menu write access is enforced in Postgres RLS and in the Menu UI
