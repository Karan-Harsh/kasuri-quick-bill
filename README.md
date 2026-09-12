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


The app name is Kasuri which is also the name of the resteraunt

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0c85e339-da0f-4831-aa15-438c850cb2e9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
