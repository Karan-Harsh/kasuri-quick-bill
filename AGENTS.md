# Kasuri Quick Bill

Simple restaurant POS: 8 tables, parcel orders, GST billing, receipts, and sales reports.

## Stack

- Tauri desktop app (Windows) — no cloud, no login
- Local server in `server/` (Bun + TypeScript + SQLite), compiled to a sidecar `.exe`
- React + TanStack Router (SPA) + React Query + Tailwind CSS + shadcn/ui

## Conventions

- Routes live in `src/routes/` (file-based TanStack Router). Do not add Next.js-style `pages/`.
- Business logic for totals and formatting: `src/lib/kasuri.ts`
- All data access goes through the local server: `server/store.ts` (business rules) and `server/main.ts` (HTTP routes).
  Screens call it with `api` from `src/lib/api.ts`. Never put business rules only in a screen.
- After changing data, the server broadcasts a topic (`orders`, `kitchen`, `menu`, ...) so open screens refresh.
- Database schema: `server/db.ts` (`CREATE TABLE IF NOT EXISTS`). Add new columns with a migration step there.
- Tests: `bun run test` (server/store.test.ts)

## Clients and access (server/app.ts)

- **Counter**: the desktop app on this computer (loopback, no key). Full access.
- **Waiter phones**: paired over Wi-Fi with a QR code, send `Authorization: Bearer <key>`. Routes marked `"waiter"`
  only — take and send orders. Everything else is `"counter"`. Mark new routes deliberately.
- The waiter app lives in `waiter/` and reuses `src/` code via the `@` alias.
