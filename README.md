# Kasuri Simple POS

Build a simple restaurant billing and sales reporting web application for a small hotel/restaurant in India.

This is NOT meant to be a full Petpooja-style POS or ERP. Keep the product simple, fast, and easy for a restaurant cashier to use.

Core requirements

TABLE MANAGEMENT

The restaurant has exactly 8 tables.

Show all 8 tables on the main dashboard.

Each table should clearly show whether it is Available or has an active order.

Clicking an occupied table should open its current order.

Clicking an available table should allow the cashier to start a new order.

PARCEL ORDERS

Provide a prominent "New Parcel" option on the dashboard.

Parcel orders should work similarly to dine-in orders but should not be associated with a table.

Each parcel order should have its own order/bill number.

MENU

Allow the restaurant owner/admin to add, edit, deactivate, and delete menu items.

Menu items should have:

Name

Category

Price

GST/tax rate

Active/inactive status

Organize menu items by category for quick ordering.

ORDER & BILLING

Cashier should be able to quickly add menu items and quantities to an order.

Allow increasing/decreasing quantities and removing items.

Calculate subtotal, applicable GST/tax, discount, and final total.

Allow payment method selection:

Cash

UPI

Card

Once paid, the bill should be marked as completed.

Generate a clean, printable receipt/invoice.

Historical bills must preserve the price and tax rate that existed when the order was created; changing a menu item's current price must not change old bills.

REPORTS
Create a Reports section with:

Today's sales

Weekly sales

Monthly sales

Total number of orders

Total sales amount

Dine-in vs parcel order breakdown

Item-wise quantity sold

Item-wise sales amount

Payment-method breakdown (Cash/UPI/Card)

Allow selecting a custom date range.

Dashboard

The main dashboard should prioritize speed of use by a cashier.

Show:

8 table cards with their current status

Total sales for today

Number of orders today

Number of parcel orders today

A large "New Parcel" button

Quick access to Reports

Quick access to Menu

Design

Clean, modern, minimal interface.

Optimized for a desktop/tablet used at a restaurant counter.

Large buttons and readable text.

Minimize the number of clicks required to create a bill.

Use clear visual distinction between available and occupied tables.

Don't add unnecessary enterprise features.

Technical direction

Use a relational database and structure the application around:

Users

Tables

Categories

Menu Items

Orders

Order Items

Bills

Payments

An order should support a type such as DINE_IN or PARCEL.

Keep the architecture simple and maintainable. Do not add inventory management, payroll, CRM, delivery integrations, Swiggy/Zomato integrations, loyalty programs, or other advanced features unless specifically requested later.

Build the application as a functional MVP rather than just a visual prototype.


The app name is Kasuri which is also the name of the restaurant.

## Connect your Supabase project

This app uses **your** Supabase project (Postgres + Auth). The old Lovable-hosted database is no longer wired in.

### 1. Create a Supabase project

1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project** → pick a name, password, and region (choose one close to India if most staff are there)
3. Wait until the project finishes provisioning

### 2. Enable email auth

In the Supabase dashboard:

1. **Authentication** → **Providers** → **Email** → enable Email provider
2. For local dev you can disable “Confirm email” under **Authentication** → **Sign In / Providers** → Email settings (optional; speeds up first signup)

### 3. Apply the database schema

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from this repo:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
bun run db:push
```

`YOUR_PROJECT_REF` is the ID in your project URL: `https://YOUR_PROJECT_REF.supabase.co`.

This runs the migrations in `supabase/migrations/` (tables, RLS, seed menu, 8 tables, bill sequence starting at 1001).

### 4. Configure environment variables

```sh
cp .env.example .env
```

Fill in from **Project Settings → API**:

| Variable | Where |
|----------|--------|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | Project URL |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`anon` / new publishable key) |
| `SUPABASE_PROJECT_ID` / `VITE_SUPABASE_PROJECT_ID` | Project ref / ID |

Server-side code reads `SUPABASE_*`; the browser bundle reads `VITE_*`. Set both pairs to the same values.

### 5. Run locally

```sh
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000), create the first staff account (becomes **admin**), then use the app.

### Migrating data from the old Lovable database

If you still have access to the previous Supabase project, export tables from its SQL editor or use `pg_dump`, then import into your new project. Otherwise start fresh — migrations already seed sample menu items and 8 tables.

## Development

Requires [Bun](https://bun.sh) or Node.js 20+.

```sh
git clone <this-repository-url>
cd kasuri-quick-bill
cp .env.example .env
# fill in Supabase credentials, then:
bun install
bun run db:push   # first time only
bun run dev
```

Other scripts:

| Command | Purpose |
|---------|---------|
| `bun run build` | Production build |
| `bun run db:push` | Apply migrations to linked Supabase project |
| `bun run lint` | ESLint |

