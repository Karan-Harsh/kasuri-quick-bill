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

## How it runs

Kasuri Quick Bill is a **Windows desktop app** (Tauri). Everything stays on the counter computer — no internet, no cloud account, no login.

```
Tauri window (React screens)  ──►  local server (Bun + TypeScript, port 8787)  ──►  SQLite file
                                        ▲
              waiter phones over the restaurant Wi-Fi (when turned on in Settings)
```

- `server/` — the local server. Owns the database and every business rule (bill/KOT numbering, send to kitchen,
  ready-to-serve, settling bills, inventory). Pushes live updates to every open screen over a WebSocket.
  It is compiled into a single `.exe` and started automatically by the desktop app.
- `src/` — the React screens (TanStack Router, React Query, Tailwind/shadcn). They call the server through `src/lib/api.ts`.
- `waiter/` — the waiter phone app (React). Built into `dist-waiter/` and served by the local server at `/waiter`.
- `src-tauri/` — the desktop shell: opens the window, starts/stops the local server.

## Waiter phones

1. On the counter: **Settings → Waiter phones → Let waiter phones connect**. The first time, Windows asks
   whether to allow Kasuri on the network — click **Allow** (private networks).
2. Click **Add a phone** and scan the QR code with the waiter's phone camera (phone on the same Wi-Fi).
   Enter the waiter's name. The phone stays paired; remove it from the same screen if it's lost.
3. Waiters pick a table, tap dishes and **Send to kitchen**. The counter chimes, shows who sent it, and
   (optionally) prints the KOT. When the kitchen marks it ready, the table turns green on the phones.

Phones can only take and send orders. Settling, discounts, menu, reports, inventory and settings are counter-only,
enforced by the server. Tip: give the counter PC a fixed address in the Wi-Fi router so phones always find it.

**Data location** (shown in Settings): `C:\Users\<name>\AppData\Roaming\in.kasuri.quickbill\kasuri.db`.
A backup copy is written to the `backups` folder next to it once a day; the last 30 are kept.

## Building the Windows installer

One-time setup on the Windows PC:

1. Install [Bun](https://bun.sh) (`powershell -c "irm bun.sh/install.ps1 | iex"`).
2. Install [Rust](https://rustup.rs) (accept the defaults).
3. Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with **Desktop development with C++**.

Then in the project folder:

```sh
bun install
bun run package
```

The installer is created at `src-tauri\target\release\bundle\nsis\Kasuri Quick Bill_1.0.0_x64-setup.exe`.
Windows may warn that the installer isn't signed: **More info → Run anyway**.

## Development

Works on macOS, Windows or Linux with [Bun](https://bun.sh):

```sh
bun install
bun run dev        # local server on :8787 + screens on http://localhost:3000
```

| Command | Purpose |
|---------|---------|
| `bun run dev` | Server (auto-restarts) + counter screens on http://localhost:3000 + waiter app at http://<this computer's IP>:8787/waiter (once waiter phones are on), data in `./data` |
| `bun run app` | The real desktop window (needs Rust) |
| `bun run test` | Business-rule tests for the server |
| `bun run typecheck` | TypeScript checks for screens and server |
| `bun run build:server` | Compile the server for this computer (`... windows` for a Windows `.exe`) |
| `bun run package` | Build the desktop installer |
| `bun run lint` | ESLint |
