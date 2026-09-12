# Kasuri — Restaurant Billing & Sales Reports

A fast counter app for Kasuri: 8 tables, parcel orders, menu management, GST billing, printable receipts, and sales reports.

## Screens

**Dashboard (home)**
- Today's totals at the top: sales amount, order count, parcel count.
- Grid of 8 table cards, colour-coded: green = available, amber = active order (shows running total and item count).
- Large "New Parcel" button.
- Buttons to Reports and Menu.

**Order screen** (opens from a table card or New Parcel)
- Left: menu items grouped by category, tabs for categories, one tap adds an item.
- Right: current bill lines with +/- quantity and remove, subtotal, GST, discount box, total.
- Payment: Cash / UPI / Card, then "Settle & Print".
- Settling frees the table and marks the bill completed.

**Menu management**
- List by category. Add, edit, deactivate/reactivate, delete items.
- Fields: name, category, price, GST rate, active toggle.
- Categories can be added and renamed.

**Receipt**
- Clean printable A4/thermal-friendly layout: Kasuri header, bill number, date/time, table or Parcel, line items with rate and amount, subtotal, GST, discount, total, payment method.

**Reports**
- Quick ranges: Today, This week, This month, plus custom date range.
- Totals: orders, sales amount.
- Dine-in vs parcel split.
- Payment method split (Cash/UPI/Card).
- Item-wise quantity sold and sales amount, sortable.

## Data & rules

Tables in the database: users, restaurant_tables (8 seeded), categories, menu_items, orders, order_items, bills, payments.

- Order type is DINE_IN or PARCEL; parcel orders have no table.
- Each order gets its own sequential bill number.
- Order lines copy the item name, price and GST rate at the moment they are added, so editing the menu later never changes past bills.
- A table can hold only one open order at a time.

## Accounts

Login is required so sales data isn't publicly readable. Two roles: cashier (dashboard, orders, reports) and admin (also menu management). Email + password sign-in; the first account created becomes admin.

## Technical notes

- Lovable Cloud (Postgres + auth) for data and login; row-level security so only signed-in staff can read/write, and menu writes restricted to admin via a separate user_roles table.
- Bill numbering via a Postgres sequence/trigger to avoid duplicates.
- Reports aggregated with SQL-side queries over a date range, served through server functions.
- Seed data: the 8 tables plus a starter set of categories and menu items so billing works immediately.
- Print via a dedicated print stylesheet on the receipt route.

## Assumptions

- GST is shown as a single total (set per item); no CGST/SGST split unless you want it.
- Amounts in INR, no service charge line.
- Design direction (colours/typography) will be proposed as options before building the UI.
