import { Database } from "bun:sqlite";

// Database schema. Ids are text UUIDs (used in screen URLs such as /order/$orderId).
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS counters (
    name  TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS organization_settings (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    name        TEXT NOT NULL DEFAULT 'Kasuri',
    gst_enabled INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS restaurant_tables (
    id           TEXT PRIMARY KEY,
    table_number INTEGER NOT NULL UNIQUE,
    label        TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id          TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name        TEXT NOT NULL,
    price       REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
    tax_rate    REAL NOT NULL DEFAULT 5 CHECK (tax_rate >= 0),
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id               TEXT PRIMARY KEY,
    bill_number      INTEGER NOT NULL UNIQUE,
    order_type       TEXT NOT NULL CHECK (order_type IN ('DINE_IN','PARCEL')),
    table_id         TEXT REFERENCES restaurant_tables(id) ON DELETE SET NULL,
    status           TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','CANCELLED')),
    discount         REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
    subtotal         REAL NOT NULL DEFAULT 0,
    tax_amount       REAL NOT NULL DEFAULT 0,
    total            REAL NOT NULL DEFAULT 0,
    payment_method   TEXT CHECK (payment_method IN ('CASH','UPI','CARD')),
    gst_applied      INTEGER NOT NULL DEFAULT 1,
    note             TEXT,
    created_by       TEXT,
    created_at       TEXT NOT NULL,
    completed_at     TEXT,
    kitchen_ready_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_open_order_per_table
    ON orders (table_id) WHERE status = 'OPEN' AND table_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
  CREATE INDEX IF NOT EXISTS orders_completed_idx ON orders (completed_at);

  CREATE TABLE IF NOT EXISTS kitchen_tickets (
    id           TEXT PRIMARY KEY,
    order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    kot_number   INTEGER NOT NULL UNIQUE,
    status       TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DONE')),
    sent_at      TEXT NOT NULL,
    sent_by      TEXT,
    completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS kitchen_tickets_order_idx ON kitchen_tickets (order_id);
  CREATE INDEX IF NOT EXISTS kitchen_tickets_status_idx ON kitchen_tickets (status);

  CREATE TABLE IF NOT EXISTS order_items (
    id                TEXT PRIMARY KEY,
    order_id          TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id      TEXT REFERENCES menu_items(id) ON DELETE SET NULL,
    item_name         TEXT NOT NULL,
    unit_price        REAL NOT NULL CHECK (unit_price >= 0),
    tax_rate          REAL NOT NULL DEFAULT 0,
    quantity          INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at        TEXT NOT NULL,
    kitchen_ticket_id TEXT REFERENCES kitchen_tickets(id) ON DELETE SET NULL,
    kitchen_sent_at   TEXT
  );
  CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);
  CREATE INDEX IF NOT EXISTS order_items_ticket_idx ON order_items (kitchen_ticket_id);

  CREATE TABLE IF NOT EXISTS payments (
    id       TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    method   TEXT NOT NULL CHECK (method IN ('CASH','UPI','CARD')),
    amount   REAL NOT NULL CHECK (amount >= 0),
    paid_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS payments_order_idx ON payments (order_id);

  CREATE TABLE IF NOT EXISTS inventory_items (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL UNIQUE,
    unit             TEXT NOT NULL DEFAULT 'kg',
    current_quantity REAL NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory_movements (
    id              TEXT PRIMARY KEY,
    item_id         TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    movement_type   TEXT NOT NULL CHECK (movement_type IN ('used','received','count')),
    quantity_change REAL NOT NULL,
    quantity_after  REAL NOT NULL CHECK (quantity_after >= 0),
    note            TEXT,
    created_by      TEXT,
    created_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS inventory_movements_item_idx ON inventory_movements (item_id, created_at);

  -- Recipe: how much of each stock item one portion of a dish uses. The amount is in "unit", which must be
  -- convertible to the stock item's own unit (e.g. 40 g of rice from a stock kept in kg).
  CREATE TABLE IF NOT EXISTS menu_item_ingredients (
    id                TEXT PRIMARY KEY,
    menu_item_id      TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity          REAL NOT NULL CHECK (quantity > 0),
    unit              TEXT NOT NULL,
    UNIQUE (menu_item_id, inventory_item_id)
  );
  CREATE INDEX IF NOT EXISTS menu_item_ingredients_inventory_idx ON menu_item_ingredients (inventory_item_id);

  -- ---------- Staff, attendance and salary (from the Kasuri Staff & Salary app) ----------
  CREATE TABLE IF NOT EXISTS employees (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    phone          TEXT NOT NULL DEFAULT '',
    role           TEXT NOT NULL DEFAULT '',
    monthly_salary REAL NOT NULL CHECK (monthly_salary >= 0),
    allowed_leaves REAL NOT NULL DEFAULT 0,
    overtime_rate  REAL NOT NULL DEFAULT 0,
    join_date      TEXT NOT NULL,
    active         INTEGER NOT NULL DEFAULT 1,
    notes          TEXT NOT NULL DEFAULT ''
  );

  -- One row per person per day that is NOT a plain "present" (present is the default).
  CREATE TABLE IF NOT EXISTS attendance (
    employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date           TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('P','A','H','L','O')),
    check_in       TEXT,
    check_out      TEXT,
    overtime_hours REAL NOT NULL DEFAULT 0,
    note           TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (employee_id, date)
  );
  CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance (date);

  -- Advances, bonuses and other deductions, settled in that month's salary.
  CREATE TABLE IF NOT EXISTS salary_adjustments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('advance','bonus','deduction')),
    amount      REAL NOT NULL CHECK (amount > 0),
    date        TEXT NOT NULL,
    note        TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS salary_adjustments_date_idx ON salary_adjustments (date);

  -- A salary marked as paid, with a snapshot of how it was calculated (later edits don't change it).
  CREATE TABLE IF NOT EXISTS salary_payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    month       TEXT NOT NULL,
    amount      REAL NOT NULL,
    paid_on     TEXT NOT NULL,
    method      TEXT NOT NULL DEFAULT 'Cash',
    note        TEXT NOT NULL DEFAULT '',
    snapshot    TEXT NOT NULL,
    UNIQUE (employee_id, month)
  );

  -- Running costs that aren't stock or salary: rent, electricity, gas, repairs...
  CREATE TABLE IF NOT EXISTS expenses (
    id         TEXT PRIMARY KEY,
    date       TEXT NOT NULL,            -- YYYY-MM-DD (local date the money was spent)
    category   TEXT NOT NULL,
    amount     REAL NOT NULL CHECK (amount > 0),
    note       TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (date);

  -- Simple on/off settings for the counter app (waiter phones, auto-print, ...). Values are JSON.
  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Waiter phones paired with this counter. Only a hash of each phone's secret key is stored.
  CREATE TABLE IF NOT EXISTS devices (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT
  );
`;

export const STARTER_TABLES = Array.from({ length: 8 }, (_, i) => ({
  table_number: i + 1,
  label: `T${i + 1}`,
}));

export const STARTER_CATEGORIES = [
  { name: "Starters", sort_order: 1 },
  { name: "Main Course", sort_order: 2 },
  { name: "Breads", sort_order: 3 },
  { name: "Beverages", sort_order: 4 },
];

export const STARTER_MENU = [
  { category: "Starters", name: "Paneer Tikka", price: 220, tax_rate: 5 },
  { category: "Starters", name: "Chicken 65", price: 260, tax_rate: 5 },
  { category: "Starters", name: "Veg Manchurian", price: 180, tax_rate: 5 },
  { category: "Starters", name: "Masala Papad", price: 60, tax_rate: 5 },
  { category: "Starters", name: "Spring Roll", price: 150, tax_rate: 5 },
  { category: "Main Course", name: "Paneer Butter Masala", price: 260, tax_rate: 5 },
  { category: "Main Course", name: "Dal Tadka", price: 180, tax_rate: 5 },
  { category: "Main Course", name: "Chicken Curry", price: 290, tax_rate: 5 },
  { category: "Main Course", name: "Mixed Veg Kadai", price: 220, tax_rate: 5 },
  { category: "Main Course", name: "Palak Paneer", price: 240, tax_rate: 5 },
  { category: "Breads", name: "Tandoori Roti", price: 20, tax_rate: 5 },
  { category: "Breads", name: "Butter Naan", price: 45, tax_rate: 5 },
  { category: "Breads", name: "Garlic Naan", price: 60, tax_rate: 5 },
  { category: "Breads", name: "Laccha Paratha", price: 55, tax_rate: 5 },
  { category: "Beverages", name: "Masala Chai", price: 30, tax_rate: 5 },
  { category: "Beverages", name: "Fresh Lime Soda", price: 70, tax_rate: 18 },
  { category: "Beverages", name: "Cold Coffee", price: 120, tax_rate: 18 },
  { category: "Beverages", name: "Mango Lassi", price: 90, tax_rate: 5 },
];

export const now = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();

/** Opens (and if new, creates and seeds) the database. Pass ":memory:" for tests. */
export function openDatabase(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA foreign_keys = ON;");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  migrate(db);

  const isNew = !db.query("SELECT 1 FROM organization_settings WHERE id = 1").get();
  if (isNew) {
    db.transaction(() => {
      db.query(
        "INSERT INTO organization_settings (id, name, gst_enabled, updated_at) VALUES (1, 'Kasuri', 0, $at)",
      ).run({
        at: now(),
      });
      // Bills start at #1001, kitchen tickets at #1.
      db.query(
        "INSERT OR IGNORE INTO counters (name, value) VALUES ('bill_number', 1000), ('kot_number', 0)",
      ).run();
      seedStarterData(db);
    })();
  }
  return db;
}

const hasColumn = (db: Database, table: string, column: string) =>
  (db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
    (c) => c.name === column,
  );

/** Brings databases created by older versions up to date. Each step must be safe to run again. */
function migrate(db: Database) {
  // Minimum stock before the app warns (in the item's own unit). NULL = no warning.
  if (!hasColumn(db, "inventory_items", "low_stock_level"))
    db.exec(
      "ALTER TABLE inventory_items ADD COLUMN low_stock_level REAL CHECK (low_stock_level >= 0)",
    );
  // Cancelled bills keep their record: when and why they were cancelled.
  if (!hasColumn(db, "orders", "cancelled_at"))
    db.exec("ALTER TABLE orders ADD COLUMN cancelled_at TEXT");
  if (!hasColumn(db, "orders", "cancel_reason"))
    db.exec("ALTER TABLE orders ADD COLUMN cancel_reason TEXT");
  // The bill a stock change came from (so cancelling a bill can return exactly what it used).
  // Not a foreign key: the stock history stays even if the bill is erased.
  if (!hasColumn(db, "inventory_movements", "order_id")) {
    db.exec("ALTER TABLE inventory_movements ADD COLUMN order_id TEXT");
    db.exec(
      "CREATE INDEX IF NOT EXISTS inventory_movements_order_idx ON inventory_movements (order_id)",
    );
  }
  // Amount paid for a delivery ("received"), for profit and loss. NULL = not entered.
  if (!hasColumn(db, "inventory_movements", "cost"))
    db.exec("ALTER TABLE inventory_movements ADD COLUMN cost REAL CHECK (cost >= 0)");
}

/** Adds the 8 tables and the starter menu, skipping anything that already exists. */
export function seedStarterData(db: Database) {
  const at = now();
  let tables = 0;
  let menuItems = 0;

  for (const t of STARTER_TABLES) {
    const r = db
      .query(
        "INSERT OR IGNORE INTO restaurant_tables (id, table_number, label, created_at) VALUES ($id, $n, $label, $at)",
      )
      .run({ id: uuid(), n: t.table_number, label: t.label, at });
    tables += r.changes;
  }

  const categoryId = new Map<string, string>();
  for (const c of STARTER_CATEGORIES) {
    db.query(
      "INSERT OR IGNORE INTO categories (id, name, sort_order, created_at) VALUES ($id, $name, $sort, $at)",
    ).run({
      id: uuid(),
      name: c.name,
      sort: c.sort_order,
      at,
    });
    const row = db
      .query<{ id: string }, { name: string }>("SELECT id FROM categories WHERE name = $name")
      .get({ name: c.name });
    if (row) categoryId.set(c.name, row.id);
  }

  for (const m of STARTER_MENU) {
    const exists = db
      .query("SELECT 1 FROM menu_items WHERE lower(name) = lower($name)")
      .get({ name: m.name });
    if (exists) continue;
    db.query(
      `INSERT INTO menu_items (id, category_id, name, price, tax_rate, is_active, created_at, updated_at)
       VALUES ($id, $cat, $name, $price, $tax, 1, $at, $at)`,
    ).run({
      id: uuid(),
      cat: categoryId.get(m.category)!,
      name: m.name,
      price: m.price,
      tax: m.tax_rate,
      at,
    });
    menuItems++;
  }

  return { tables, menuItems };
}

/** Next value of a counter (bill and KOT numbers). Numbers are never reused, even if a bill is discarded. */
export function nextCounter(db: Database, name: "bill_number" | "kot_number"): number {
  const row = db
    .query<{ value: number }, { name: string }>(
      "UPDATE counters SET value = value + 1 WHERE name = $name RETURNING value",
    )
    .get({ name });
  if (!row) throw new Error(`Missing counter ${name}`);
  return row.value;
}
