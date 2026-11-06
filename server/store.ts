import type { Database } from "bun:sqlite";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { compatibleUnits, convertQuantity } from "../src/lib/inventory";
import { computeTotals } from "../src/lib/kasuri";
import { nextCounter, now, seedStarterData, uuid } from "./db";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** What changed, so connected screens know what to reload. */
export type Topic = "orders" | "kitchen" | "menu" | "inventory" | "settings" | "tables" | "devices";

/** On/off settings of the counter app. */
export interface AppSettings {
  /** Let paired waiter phones connect over the restaurant Wi-Fi. */
  waiter_phones_enabled: boolean;
  /** Print the KOT at the counter when a waiter sends an order to the kitchen. */
  auto_print_waiter_kot: boolean;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  waiter_phones_enabled: false,
  auto_print_waiter_kot: true,
};

export interface Device {
  id: string;
  name: string;
  created_at: string;
  last_seen_at: string | null;
}

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
const PAIRING_MAX_ATTEMPTS = 5;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

type Row = Record<string, unknown>;

export interface OrderRow {
  id: string;
  bill_number: number;
  order_type: "DINE_IN" | "PARCEL";
  table_id: string | null;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  discount: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  payment_method: string | null;
  gst_applied: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  kitchen_ready_at: string | null;
}

export interface IngredientInput {
  inventory_item_id: string;
  quantity: number;
  unit: string;
}

const PAYMENT_METHODS = ["CASH", "UPI", "CARD"];
const MOVEMENT_TYPES = ["used", "received", "count"];
const round3 = (n: number) => Math.round(n * 1000) / 1000;

// SQLite stores booleans as 0/1; the screens expect true/false.
const bool = <T extends Row>(row: T, ...keys: string[]): T => {
  for (const k of keys) if (k in row) (row as Row)[k] = Boolean(row[k]);
  return row;
};

export class Store {
  /** The code currently shown on the counter for pairing a new phone (kept in memory only). */
  private pairing: { code: string; expires: number; attempts: number } | null = null;

  constructor(private db: Database) {}

  private all<T = Row>(sql: string, params: Row = {}): T[] {
    return this.db.query(sql).all(params as never) as T[];
  }

  private get<T = Row>(sql: string, params: Row = {}): T | null {
    return (this.db.query(sql).get(params as never) as T) ?? null;
  }

  private run(sql: string, params: Row = {}) {
    return this.db.query(sql).run(params as never);
  }

  private tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /** Runs `fn` in a transaction (a savepoint when already inside one): all of it is saved, or none. */
  transaction<T>(fn: () => T): T {
    return this.tx(fn);
  }

  /** Runs `fn` for real, then keeps its changes only if `keep(result)` says so (used to check an
   *  upload without saving it). `finish` adjusts the result once the outcome is known. */
  trial<T>(fn: () => T, keep: (result: T) => boolean, finish: (result: T) => T): T {
    const undo = Symbol("undo");
    let result!: T;
    try {
      this.tx(() => {
        result = fn();
        if (!keep(result)) throw undo;
      });
    } catch (err) {
      if (err !== undo) throw err;
    }
    return finish(result);
  }

  // ---------- settings ----------

  settings() {
    return bool(
      this.get<Row>("SELECT id, name, gst_enabled FROM organization_settings WHERE id = 1")!,
      "gst_enabled",
    );
  }

  updateSettings(input: { name?: string; gst_enabled?: boolean }) {
    const current = this.settings();
    const name =
      typeof input.name === "string" && input.name.trim() ? input.name.trim() : current.name;
    const gst = typeof input.gst_enabled === "boolean" ? input.gst_enabled : current.gst_enabled;
    this.run(
      "UPDATE organization_settings SET name = $name, gst_enabled = $gst, updated_at = $at WHERE id = 1",
      {
        name,
        gst: gst ? 1 : 0,
        at: now(),
      },
    );
    return this.settings();
  }

  appSettings(): AppSettings {
    const rows = this.all<{ key: string; value: string }>("SELECT key, value FROM app_settings");
    const out = { ...DEFAULT_APP_SETTINGS };
    for (const r of rows) if (r.key in out) Object.assign(out, { [r.key]: JSON.parse(r.value) });
    return out;
  }

  updateAppSettings(patch: Partial<AppSettings>) {
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (!(key in DEFAULT_APP_SETTINGS) || typeof value !== "boolean") continue;
      this.run(
        "INSERT INTO app_settings (key, value) VALUES ($k, $v) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        {
          k: key,
          v: JSON.stringify(value),
        },
      );
    }
    return this.appSettings();
  }

  // ---------- waiter phones ----------

  /** Starts pairing a new phone: returns a 6-digit code valid for 10 minutes, usable once. */
  startPairing() {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    this.pairing = { code, expires: Date.now() + PAIRING_CODE_TTL_MS, attempts: 0 };
    return { code, expires_at: new Date(this.pairing.expires).toISOString() };
  }

  /** Exchanges the pairing code for a secret key that the phone keeps. */
  pairDevice(code: string, name: string) {
    const p = this.pairing;
    const deviceName = (name ?? "").trim().slice(0, 40);
    if (!p || Date.now() > p.expires)
      throw new AppError("This code has expired. Ask the counter for a new one.", 401);
    if (String(code ?? "").trim() !== p.code) {
      p.attempts++;
      // Stop guessing: after a few wrong tries the counter must show a new code.
      if (p.attempts >= PAIRING_MAX_ATTEMPTS) this.pairing = null;
      throw new AppError("Wrong code. Check the number on the counter screen.", 401);
    }
    if (!deviceName) throw new AppError("Enter the waiter's name");
    this.pairing = null;
    const token = randomBytes(32).toString("hex");
    const device: Device = { id: uuid(), name: deviceName, created_at: now(), last_seen_at: now() };
    this.run(
      "INSERT INTO devices (id, name, token_hash, created_at, last_seen_at) VALUES ($id, $name, $hash, $at, $at)",
      {
        id: device.id,
        name: device.name,
        hash: sha256(token),
        at: device.created_at,
      },
    );
    return { token, device };
  }

  /** Finds the phone that owns this key (and notes it was just seen), or null. */
  deviceForToken(token: string | null | undefined): Device | null {
    if (!token) return null;
    const d = this.get<Device>(
      "SELECT id, name, created_at, last_seen_at FROM devices WHERE token_hash = $h",
      { h: sha256(token) },
    );
    if (d)
      this.run("UPDATE devices SET last_seen_at = $at WHERE id = $id", { at: now(), id: d.id });
    return d;
  }

  devices() {
    return this.all<Device>(
      "SELECT id, name, created_at, last_seen_at FROM devices ORDER BY created_at",
    );
  }

  removeDevice(id: string) {
    this.run("DELETE FROM devices WHERE id = $id", { id });
  }

  // ---------- tables & orders ----------

  tables() {
    return this.all("SELECT id, table_number, label FROM restaurant_tables ORDER BY table_number");
  }

  /** Open orders for the table board, each with its lines and count of tickets still cooking. */
  openOrders() {
    const orders = this.all<Row>(
      `SELECT o.id, o.table_id, o.order_type, o.bill_number, o.created_at, o.kitchen_ready_at,
              (SELECT COUNT(*) FROM kitchen_tickets k WHERE k.order_id = o.id AND k.status = 'OPEN') AS open_ticket_count
       FROM orders o WHERE o.status = 'OPEN' ORDER BY o.created_at`,
    );
    const lines = this.all<Row>(
      `SELECT i.order_id, i.unit_price, i.tax_rate, i.quantity, i.kitchen_sent_at
       FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status = 'OPEN' ORDER BY i.created_at`,
    );
    return orders.map((o) => ({
      ...o,
      order_items: lines.filter((l) => l.order_id === o.id).map(({ order_id: _, ...l }) => l),
    }));
  }

  todayStats(fromIso: string) {
    const rows = this.all<{ order_type: string; total: number }>(
      "SELECT order_type, total FROM orders WHERE status = 'COMPLETED' AND completed_at >= $from",
      { from: fromIso },
    );
    return {
      sales: rows.reduce((s, r) => s + Number(r.total), 0),
      orders: rows.length,
      parcels: rows.filter((r) => r.order_type === "PARCEL").length,
    };
  }

  /** Starts a dine-in order for a table (or a parcel order when tableId is null).
   *  If the table already has an open order, that one is returned instead. */
  createOrder(tableId: string | null, createdBy: string | null = null) {
    return this.tx(() => {
      if (tableId) {
        if (!this.get("SELECT 1 FROM restaurant_tables WHERE id = $id", { id: tableId })) {
          throw new AppError("Table not found", 404);
        }
        const existing = this.get<{ id: string }>(
          "SELECT id FROM orders WHERE table_id = $t AND status = 'OPEN'",
          {
            t: tableId,
          },
        );
        if (existing) return { id: existing.id, existing: true };
      }
      const id = uuid();
      this.run(
        `INSERT INTO orders (id, bill_number, order_type, table_id, created_by, created_at)
         VALUES ($id, $bill, $type, $table, $by, $at)`,
        {
          id,
          bill: nextCounter(this.db, "bill_number"),
          type: tableId ? "DINE_IN" : "PARCEL",
          table: tableId,
          by: createdBy,
          at: now(),
        },
      );
      return { id, existing: false };
    });
  }

  order(id: string): OrderRow & { restaurant_tables: { label: string } | null } {
    const o = this.get<OrderRow>("SELECT * FROM orders WHERE id = $id", { id });
    if (!o) throw new AppError("Order not found", 404);
    const table = o.table_id
      ? this.get<{ label: string }>("SELECT label FROM restaurant_tables WHERE id = $id", {
          id: o.table_id,
        })
      : null;
    return { ...o, gst_applied: Boolean(o.gst_applied), restaurant_tables: table };
  }

  orderItems(orderId: string) {
    return this.all("SELECT * FROM order_items WHERE order_id = $id ORDER BY created_at, rowid", {
      id: orderId,
    });
  }

  /** Order with table and lines, for the printed bill. */
  receipt(id: string) {
    return { ...this.order(id), order_items: this.orderItems(id) };
  }

  private openOrderOrThrow(orderId: string) {
    const o = this.get<{ status: string }>("SELECT status FROM orders WHERE id = $id", {
      id: orderId,
    });
    if (!o) throw new AppError("Order not found", 404);
    if (o.status !== "OPEN") throw new AppError("Order is not open");
  }

  /** Adds `quantity` of a menu item. New quantity always goes on a line that hasn't been sent to the
   *  kitchen yet, so the next KOT only lists what is new. */
  private addToUnsentLine(
    orderId: string,
    item: { id: string | null; name: string; price: number; tax_rate: number },
    quantity: number,
  ) {
    const line = this.get<{ id: string }>(
      `SELECT id FROM order_items
       WHERE order_id = $o AND menu_item_id IS $m AND item_name = $name AND unit_price = $p AND tax_rate = $t
         AND kitchen_sent_at IS NULL
       LIMIT 1`,
      { o: orderId, m: item.id, name: item.name, p: item.price, t: item.tax_rate },
    );
    if (line) {
      this.run("UPDATE order_items SET quantity = quantity + $q WHERE id = $id", {
        q: quantity,
        id: line.id,
      });
      return;
    }
    this.run(
      `INSERT INTO order_items (id, order_id, menu_item_id, item_name, unit_price, tax_rate, quantity, created_at)
       VALUES ($id, $o, $m, $name, $p, $t, $q, $at)`,
      {
        id: uuid(),
        o: orderId,
        m: item.id,
        name: item.name,
        p: item.price,
        t: item.tax_rate,
        q: quantity,
        at: now(),
      },
    );
  }

  addItem(orderId: string, menuItemId: string) {
    this.tx(() => {
      this.openOrderOrThrow(orderId);
      const item = this.get<{
        id: string;
        name: string;
        price: number;
        tax_rate: number;
        is_active: number;
      }>("SELECT id, name, price, tax_rate, is_active FROM menu_items WHERE id = $id", {
        id: menuItemId,
      });
      if (!item) throw new AppError("Menu item not found", 404);
      if (!item.is_active) throw new AppError(`${item.name} is not available right now`);
      this.addToUnsentLine(orderId, item, 1);
    });
  }

  /** Changes a line's quantity. 0 removes it. Raising an item already sent to the kitchen puts the
   *  extra on a new unsent line (so only the extra is printed on the next KOT); lowering it just reduces it. */
  setItemQuantity(lineId: string, quantity: number, opts: { waiter?: boolean } = {}) {
    if (!Number.isInteger(quantity) || quantity < 0)
      throw new AppError("Quantity must be a whole number");
    this.tx(() => {
      const line = this.get<
        Row & { order_id: string; quantity: number; kitchen_sent_at: string | null }
      >("SELECT * FROM order_items WHERE id = $id", { id: lineId });
      if (!line) throw new AppError("Item not found", 404);
      this.openOrderOrThrow(line.order_id);
      if (opts.waiter && line.kitchen_sent_at) {
        throw new AppError("Already sent to the kitchen. Ask the counter to change it.", 403);
      }
      if (quantity === 0) {
        this.run("DELETE FROM order_items WHERE id = $id", { id: lineId });
      } else if (line.kitchen_sent_at && quantity > line.quantity) {
        this.addToUnsentLine(
          line.order_id,
          {
            id: line.menu_item_id as string | null,
            name: line.item_name as string,
            price: line.unit_price as number,
            tax_rate: line.tax_rate as number,
          },
          quantity - line.quantity,
        );
      } else {
        this.run("UPDATE order_items SET quantity = $q WHERE id = $id", {
          q: quantity,
          id: lineId,
        });
      }
      this.refreshKitchenReady(line.order_id);
    });
  }

  /** Creates a KOT for every line not yet sent. */
  sendToKitchen(orderId: string, sentBy: string | null = null) {
    return this.tx(() => {
      this.openOrderOrThrow(orderId);
      const pending = this.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM order_items WHERE order_id = $id AND kitchen_sent_at IS NULL",
        { id: orderId },
      )!.n;
      if (pending === 0) throw new AppError("No new items to send to kitchen");
      const id = uuid();
      const kot = nextCounter(this.db, "kot_number");
      const at = now();
      this.run(
        "INSERT INTO kitchen_tickets (id, order_id, kot_number, sent_at, sent_by) VALUES ($id, $o, $kot, $at, $by)",
        { id, o: orderId, kot, at, by: sentBy },
      );
      this.run(
        "UPDATE order_items SET kitchen_ticket_id = $t, kitchen_sent_at = $at WHERE order_id = $o AND kitchen_sent_at IS NULL",
        { t: id, at, o: orderId },
      );
      this.run("UPDATE orders SET kitchen_ready_at = NULL WHERE id = $id", { id: orderId });
      return { id, kot_number: kot };
    });
  }

  /** An order is "ready" when nothing is cooking and nothing is waiting to be sent. */
  private refreshKitchenReady(orderId: string) {
    const cooking = this.get(
      "SELECT 1 FROM kitchen_tickets WHERE order_id = $id AND status = 'OPEN'",
      { id: orderId },
    );
    const unsent = this.get(
      "SELECT 1 FROM order_items WHERE order_id = $id AND kitchen_sent_at IS NULL",
      { id: orderId },
    );
    if (cooking || unsent) {
      this.run("UPDATE orders SET kitchen_ready_at = NULL WHERE id = $id", { id: orderId });
    }
  }

  completeTicket(ticketId: string) {
    this.tx(() => {
      const t = this.get<{ order_id: string; status: string }>(
        "SELECT order_id, status FROM kitchen_tickets WHERE id = $id",
        {
          id: ticketId,
        },
      );
      if (!t || t.status !== "OPEN") throw new AppError("Ticket not found or already done");
      this.run("UPDATE kitchen_tickets SET status = 'DONE', completed_at = $at WHERE id = $id", {
        at: now(),
        id: ticketId,
      });
      const cooking = this.get(
        "SELECT 1 FROM kitchen_tickets WHERE order_id = $id AND status = 'OPEN'",
        { id: t.order_id },
      );
      const unsent = this.get(
        "SELECT 1 FROM order_items WHERE order_id = $id AND kitchen_sent_at IS NULL",
        { id: t.order_id },
      );
      if (!cooking && !unsent) {
        this.run("UPDATE orders SET kitchen_ready_at = $at WHERE id = $id AND status = 'OPEN'", {
          at: now(),
          id: t.order_id,
        });
      }
    });
  }

  acknowledgeReady(orderId: string) {
    const r = this.run(
      "UPDATE orders SET kitchen_ready_at = NULL WHERE id = $id AND status = 'OPEN' AND kitchen_ready_at IS NOT NULL",
      { id: orderId },
    );
    if (r.changes === 0) throw new AppError("Order is not waiting to be served");
  }

  /** Closes the bill. Totals are calculated here from the saved lines, never trusted from the screen. */
  settle(orderId: string, input: { discount?: number; payment_method?: string }) {
    const method = input.payment_method ?? "CASH";
    if (!PAYMENT_METHODS.includes(method)) throw new AppError("Invalid payment method");
    return this.tx(() => {
      this.openOrderOrThrow(orderId);
      const lines = this.all<{ unit_price: number; tax_rate: number; quantity: number }>(
        "SELECT unit_price, tax_rate, quantity FROM order_items WHERE order_id = $id",
        { id: orderId },
      );
      if (lines.length === 0) throw new AppError("Add at least one item before settling");
      const gstEnabled = this.settings().gst_enabled as boolean;
      const t = computeTotals(lines, Number(input.discount) || 0, { gstEnabled });
      const at = now();
      this.run(
        `UPDATE orders SET status = 'COMPLETED', discount = $d, subtotal = $s, tax_amount = $tax, total = $total,
           payment_method = $m, gst_applied = $gst, completed_at = $at, kitchen_ready_at = NULL
         WHERE id = $id`,
        {
          d: t.discount,
          s: t.subtotal,
          tax: t.taxAmount,
          total: t.total,
          m: method,
          gst: gstEnabled ? 1 : 0,
          at,
          id: orderId,
        },
      );
      this.run(
        "INSERT INTO payments (id, order_id, method, amount, paid_at) VALUES ($id, $o, $m, $a, $at)",
        {
          id: uuid(),
          o: orderId,
          m: method,
          a: t.total,
          at,
        },
      );
      const billNumber = this.order(orderId).bill_number;
      this.useStockForOrder(orderId, billNumber);
      return { ...t, bill_number: billNumber };
    });
  }

  /** Takes the ingredients of every dish on a settled bill out of stock, one update per stock item.
   *  Billing never fails because of stock: if the books say there is less than the recipe needs,
   *  stock just goes to zero (a stock count will correct it). */
  private useStockForOrder(orderId: string, billNumber: number) {
    const rows = this.all<{
      inventory_item_id: string;
      recipe_qty: number;
      recipe_unit: string;
      stock_unit: string;
      portions: number;
    }>(
      `SELECT r.inventory_item_id, r.quantity AS recipe_qty, r.unit AS recipe_unit,
              inv.unit AS stock_unit, SUM(i.quantity) AS portions
       FROM order_items i
       JOIN menu_item_ingredients r ON r.menu_item_id = i.menu_item_id
       JOIN inventory_items inv ON inv.id = r.inventory_item_id AND inv.is_active = 1
       WHERE i.order_id = $o
       GROUP BY r.id`,
      { o: orderId },
    );
    const needed = new Map<string, number>();
    for (const r of rows) {
      const perPortion = convertQuantity(r.recipe_qty, r.recipe_unit, r.stock_unit);
      if (perPortion == null) continue; // unit no longer matches; skipped rather than guessed
      needed.set(
        r.inventory_item_id,
        (needed.get(r.inventory_item_id) ?? 0) + perPortion * r.portions,
      );
    }
    for (const [itemId, amount] of needed) {
      const item = this.get<{ current_quantity: number }>(
        "SELECT current_quantity FROM inventory_items WHERE id = $id",
        { id: itemId },
      )!;
      this.writeStock(
        itemId,
        "used",
        Math.max(0, round3(item.current_quantity - amount)),
        item.current_quantity,
        `Bill #${billNumber}`,
        null,
        orderId,
      );
    }
  }

  /** Puts back the stock a settled bill used (after cancelling or erasing it). */
  private returnStockForOrder(orderId: string, billNumber: number, why: "cancelled" | "erased") {
    // Bills settled before stock changes were linked to bills are found by their note.
    const used = this.all<{ item_id: string; amount: number }>(
      `SELECT item_id, -SUM(quantity_change) AS amount FROM inventory_movements
       WHERE movement_type = 'used'
         AND (order_id = $o OR (order_id IS NULL AND note = $note))
       GROUP BY item_id`,
      { o: orderId, note: `Bill #${billNumber}` },
    );
    for (const u of used) {
      if (!(u.amount > 0)) continue;
      const item = this.get<{ current_quantity: number }>(
        "SELECT current_quantity FROM inventory_items WHERE id = $id",
        { id: u.item_id },
      );
      if (!item) continue;
      this.writeStock(
        u.item_id,
        "received",
        round3(item.current_quantity + u.amount),
        item.current_quantity,
        `Bill #${billNumber} ${why}`,
        null,
        orderId,
      );
    }
  }

  private settledBillOrThrow(orderId: string) {
    const o = this.get<{ status: string; bill_number: number }>(
      "SELECT status, bill_number FROM orders WHERE id = $id",
      { id: orderId },
    );
    if (!o) throw new AppError("Bill not found", 404);
    if (o.status === "OPEN")
      throw new AppError("This bill is still open. Discard it from its table instead.");
    return o;
  }

  /** Cancels a settled bill: it stays on record (marked cancelled) but no longer counts as a sale,
   *  and the stock its dishes used is put back. */
  cancelBill(orderId: string, reason?: string | null) {
    return this.tx(() => {
      const o = this.settledBillOrThrow(orderId);
      if (o.status === "CANCELLED")
        throw new AppError(`Bill #${o.bill_number} is already cancelled`);
      this.run(
        "UPDATE orders SET status = 'CANCELLED', cancelled_at = $at, cancel_reason = $why WHERE id = $id",
        { at: now(), why: (reason ?? "").trim().slice(0, 200) || null, id: orderId },
      );
      this.returnStockForOrder(orderId, o.bill_number, "cancelled");
      return { bill_number: o.bill_number };
    });
  }

  /** Erases a settled or cancelled bill for good. Its number is not reused. */
  eraseBill(orderId: string) {
    return this.tx(() => {
      const o = this.settledBillOrThrow(orderId);
      // A cancelled bill already gave its stock back.
      if (o.status === "COMPLETED") this.returnStockForOrder(orderId, o.bill_number, "erased");
      this.run("DELETE FROM orders WHERE id = $id", { id: orderId });
      return { bill_number: o.bill_number };
    });
  }

  discardOrder(orderId: string) {
    this.tx(() => {
      this.openOrderOrThrow(orderId);
      this.run("DELETE FROM orders WHERE id = $id", { id: orderId });
    });
  }

  // ---------- kitchen ----------

  private ticketLines(ticketIds: string[]) {
    if (ticketIds.length === 0) return [];
    return this.all<{ id: string; item_name: string; quantity: number; kitchen_ticket_id: string }>(
      `SELECT id, item_name, quantity, kitchen_ticket_id FROM order_items
       WHERE kitchen_ticket_id IN (SELECT value FROM json_each($ids)) ORDER BY created_at`,
      { ids: JSON.stringify(ticketIds) },
    );
  }

  /** Open tickets, oldest first, already flattened for the kitchen screen. */
  openTickets() {
    const tickets = this.all<Row & { id: string }>(
      `SELECT k.id, k.kot_number, k.status, k.sent_at, k.sent_by, k.completed_at, k.order_id,
              o.bill_number, o.order_type, t.label AS table_label
       FROM kitchen_tickets k JOIN orders o ON o.id = k.order_id
       LEFT JOIN restaurant_tables t ON t.id = o.table_id
       WHERE k.status = 'OPEN' ORDER BY k.sent_at`,
    );
    const lines = this.ticketLines(tickets.map((t) => t.id));
    return tickets.map((t) => ({
      ...t,
      lines: lines
        .filter((l) => l.kitchen_ticket_id === t.id)
        .map(({ kitchen_ticket_id: _, ...l }) => l),
    }));
  }

  /** One ticket with its order (bill, table) and lines, for the KOT print page. */
  ticket(id: string) {
    const t = this.get<Row & { order_id: string; sent_by: string | null }>(
      "SELECT * FROM kitchen_tickets WHERE id = $id",
      { id },
    );
    if (!t) throw new AppError("Ticket not found", 404);
    const o = this.get<Row>(
      `SELECT o.bill_number, o.order_type, t.label FROM orders o
       LEFT JOIN restaurant_tables t ON t.id = o.table_id WHERE o.id = $id`,
      { id: t.order_id },
    );
    return {
      ...t,
      orders: o
        ? {
            bill_number: o.bill_number,
            order_type: o.order_type,
            restaurant_tables: o.label ? { label: o.label } : null,
          }
        : null,
      order_items: this.ticketLines([id]).map(({ kitchen_ticket_id: _, ...l }) => l),
    };
  }

  // ---------- menu ----------

  categories() {
    return this.all("SELECT id, name, sort_order FROM categories ORDER BY sort_order, name");
  }

  addCategory(name: string) {
    const trimmed = (name ?? "").trim();
    if (!trimmed) throw new AppError("Category name is required");
    if (this.get("SELECT 1 FROM categories WHERE lower(name) = lower($n)", { n: trimmed })) {
      throw new AppError(`Category "${trimmed}" already exists`);
    }
    const next = this.get<{ n: number }>(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories",
    )!.n;
    this.run(
      "INSERT INTO categories (id, name, sort_order, created_at) VALUES ($id, $name, $s, $at)",
      {
        id: uuid(),
        name: trimmed,
        s: next,
        at: now(),
      },
    );
  }

  menuItems(activeOnly: boolean) {
    const rows = this.all<Row>(
      `SELECT id, name, price, tax_rate, is_active, category_id FROM menu_items
       ${activeOnly ? "WHERE is_active = 1" : ""} ORDER BY name`,
    );
    return rows.map((r) => bool(r, "is_active"));
  }

  /** Every dish's recipe lines, for the menu screen. */
  menuIngredients() {
    return this.all(
      `SELECT r.id, r.menu_item_id, r.inventory_item_id, r.quantity, r.unit, inv.name AS inventory_name
       FROM menu_item_ingredients r JOIN inventory_items inv ON inv.id = r.inventory_item_id
       ORDER BY inv.name`,
    );
  }

  /** Replaces a dish's recipe with `lines`. */
  private saveIngredients(menuItemId: string, lines: unknown) {
    if (!Array.isArray(lines)) throw new AppError("Ingredients must be a list");
    const seen = new Set<string>();
    const clean: IngredientInput[] = [];
    for (const raw of lines as Partial<IngredientInput>[]) {
      const inv = this.get<{ name: string; unit: string }>(
        "SELECT name, unit FROM inventory_items WHERE id = $id",
        { id: raw?.inventory_item_id ?? "" },
      );
      if (!inv) throw new AppError("Pick a stock item for each ingredient");
      if (seen.has(raw!.inventory_item_id!))
        throw new AppError(`${inv.name} is listed twice. Put the total amount on one line.`);
      seen.add(raw!.inventory_item_id!);
      const qty = Number(raw?.quantity);
      if (!Number.isFinite(qty) || qty <= 0)
        throw new AppError(`Enter how much ${inv.name} one portion uses`);
      const unit = String(raw?.unit ?? inv.unit);
      if (!compatibleUnits(inv.unit).includes(unit))
        throw new AppError(
          `${inv.name} is kept in ${inv.unit}, so it can't be measured in ${unit}`,
        );
      clean.push({ inventory_item_id: raw!.inventory_item_id!, quantity: round3(qty), unit });
    }
    this.run("DELETE FROM menu_item_ingredients WHERE menu_item_id = $id", { id: menuItemId });
    for (const l of clean) {
      this.run(
        `INSERT INTO menu_item_ingredients (id, menu_item_id, inventory_item_id, quantity, unit)
         VALUES ($id, $m, $inv, $q, $u)`,
        { id: uuid(), m: menuItemId, inv: l.inventory_item_id, q: l.quantity, u: l.unit },
      );
    }
  }

  saveMenuItem(
    id: string | null,
    input: Partial<{
      name: string;
      category_id: string;
      price: number;
      tax_rate: number;
      is_active: boolean;
      /** When given, replaces the dish's recipe. */
      ingredients: IngredientInput[];
    }>,
  ) {
    const existing = id ? this.get<Row>("SELECT * FROM menu_items WHERE id = $id", { id }) : null;
    if (id && !existing) throw new AppError("Menu item not found", 404);
    const name = (input.name ?? (existing?.name as string) ?? "").trim();
    const categoryId = input.category_id ?? (existing?.category_id as string);
    const price = Number(input.price ?? existing?.price ?? 0);
    const tax = Number(input.tax_rate ?? existing?.tax_rate ?? 0);
    const active = input.is_active ?? (existing ? Boolean(existing.is_active) : true);
    if (!name) throw new AppError("Item name is required");
    if (!categoryId || !this.get("SELECT 1 FROM categories WHERE id = $id", { id: categoryId }))
      throw new AppError("Pick a category");
    if (!(price >= 0)) throw new AppError("Price must be zero or more");
    if (!(tax >= 0)) throw new AppError("GST rate must be zero or more");
    const params = {
      id: id ?? uuid(),
      cat: categoryId,
      name,
      price,
      tax,
      active: active ? 1 : 0,
      at: now(),
    };
    return this.tx(() => {
      if (existing) {
        this.run(
          "UPDATE menu_items SET category_id = $cat, name = $name, price = $price, tax_rate = $tax, is_active = $active, updated_at = $at WHERE id = $id",
          params,
        );
      } else {
        this.run(
          `INSERT INTO menu_items (id, category_id, name, price, tax_rate, is_active, created_at, updated_at)
           VALUES ($id, $cat, $name, $price, $tax, $active, $at, $at)`,
          params,
        );
      }
      if (input.ingredients !== undefined) this.saveIngredients(params.id, input.ingredients);
      return { id: params.id };
    });
  }

  deleteMenuItem(id: string) {
    // Past bills keep the item's name and price on their own lines, so deleting is safe.
    this.run("DELETE FROM menu_items WHERE id = $id", { id });
  }

  seedStarter() {
    return this.tx(() => ({ ...seedStarterData(this.db), tablesSkipped: false }));
  }

  // ---------- reports ----------

  report(fromIso: string, toIso: string) {
    const orders = this.all<Row & { id: string }>(
      `SELECT o.id, o.bill_number, o.order_type, o.payment_method, o.subtotal, o.discount, o.tax_amount,
              o.total, o.created_at, o.completed_at, o.status, o.cancelled_at, o.cancel_reason,
              t.label AS table_label,
              (SELECT COALESCE(SUM(i.quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS item_count
       FROM orders o LEFT JOIN restaurant_tables t ON t.id = o.table_id
       -- Cancelled bills are listed (marked) but only completed ones count as sales.
       WHERE o.status IN ('COMPLETED', 'CANCELLED') AND o.completed_at >= $from AND o.completed_at <= $to
       ORDER BY o.completed_at DESC`,
      { from: fromIso, to: toIso },
    );
    const lines = this.all(
      `SELECT i.item_name, i.quantity, i.unit_price FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.status = 'COMPLETED' AND o.completed_at >= $from AND o.completed_at <= $to`,
      { from: fromIso, to: toIso },
    );
    return { orders, lines };
  }

  // ---------- inventory ----------

  inventoryItems() {
    return this.all<Row>(
      `SELECT i.id, i.name, i.unit, i.current_quantity, i.low_stock_level, i.is_active, i.updated_at,
              (SELECT COUNT(*) FROM menu_item_ingredients r WHERE r.inventory_item_id = i.id) AS dish_count
       FROM inventory_items i ORDER BY i.name`,
    ).map((r) => bool(r, "is_active"));
  }

  inventoryMovements(limit = 30) {
    const rows = this.all<Row>(
      `SELECT m.id, m.item_id, m.movement_type, m.quantity_change, m.quantity_after, m.note, m.created_at,
              i.name AS item_name, i.unit AS item_unit
       FROM inventory_movements m JOIN inventory_items i ON i.id = m.item_id
       ORDER BY m.created_at DESC, m.rowid DESC LIMIT $limit`,
      { limit: Math.min(Math.max(Number(limit) || 30, 1), 500) },
    );
    return rows.map(({ item_name, item_unit, ...m }) => ({
      ...m,
      inventory_items: { name: item_name, unit: item_unit },
    }));
  }

  saveInventoryItem(
    id: string | null,
    input: {
      name?: string;
      unit?: string;
      is_active?: boolean;
      opening_quantity?: number;
      /** Warn when stock goes below this (in the item's unit). null or "" = no warning. */
      low_stock_level?: number | string | null;
    },
  ) {
    const name = (input.name ?? "").trim();
    if (!name) throw new AppError("Item name is required");
    const unit = (input.unit ?? "kg").trim() || "kg";
    const active = input.is_active ?? true;
    const rawLevel = input.low_stock_level;
    const lowLevel = rawLevel == null || rawLevel === "" ? null : Number(rawLevel);
    if (lowLevel != null && !(Number.isFinite(lowLevel) && lowLevel >= 0))
      throw new AppError("Minimum stock must be zero or more");
    const clash = this.get<{ id: string }>(
      "SELECT id FROM inventory_items WHERE lower(name) = lower($n)",
      { n: name },
    );
    if (clash && clash.id !== id) throw new AppError(`"${name}" is already in the inventory`);

    return this.tx(() => {
      if (id) {
        // Recipes measure this item in its unit's family (g/kg, ml/L, pcs/dozen); don't break them.
        const clashing = this.get<{ unit: string }>(
          "SELECT unit FROM menu_item_ingredients WHERE inventory_item_id = $id",
          { id },
        );
        if (clashing && !compatibleUnits(unit).includes(clashing.unit))
          throw new AppError(
            `Dishes use ${name} in ${clashing.unit}. Pick a unit like ${compatibleUnits(clashing.unit).join(" or ")}, or change those recipes first.`,
          );
        const r = this.run(
          `UPDATE inventory_items SET name = $name, unit = $unit, is_active = $a, updated_at = $at,
             low_stock_level = CASE WHEN $keep THEN low_stock_level ELSE $low END
           WHERE id = $id`,
          {
            name,
            unit,
            a: active ? 1 : 0,
            low: lowLevel,
            keep: rawLevel === undefined ? 1 : 0,
            at: now(),
            id,
          },
        );
        if (r.changes === 0) throw new AppError("Inventory item not found", 404);
        return { id };
      }
      const newId = uuid();
      const at = now();
      this.run(
        "INSERT INTO inventory_items (id, name, unit, current_quantity, low_stock_level, is_active, created_at, updated_at) VALUES ($id, $name, $unit, 0, $low, $a, $at, $at)",
        { id: newId, name, unit, low: lowLevel, a: active ? 1 : 0, at },
      );
      const opening = Number(input.opening_quantity) || 0;
      if (opening < 0) throw new AppError("Starting quantity must be zero or more");
      if (opening > 0) this.recordMovement(newId, "count", opening, "Opening stock");
      return { id: newId };
    });
  }

  setInventoryActive(id: string, active: boolean) {
    this.run("UPDATE inventory_items SET is_active = $a, updated_at = $at WHERE id = $id", {
      a: active ? 1 : 0,
      at: now(),
      id,
    });
  }

  /** used = subtract, received = add, count = set to the counted amount. Stock can never go below zero. */
  recordMovement(
    itemId: string,
    type: string,
    quantity: number,
    note?: string | null,
    createdBy: string | null = null,
  ) {
    if (!MOVEMENT_TYPES.includes(type)) throw new AppError("Invalid stock update type");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) throw new AppError("Quantity must be zero or positive");
    if (type !== "count" && qty === 0)
      throw new AppError(
        `${type === "used" ? "Used" : "Received"} quantity must be greater than zero`,
      );

    return this.tx(() => {
      const item = this.get<{ current_quantity: number; unit: string }>(
        "SELECT current_quantity, unit FROM inventory_items WHERE id = $id",
        { id: itemId },
      );
      if (!item) throw new AppError("Inventory item not found", 404);
      let next: number;
      let delta: number;
      if (type === "count") {
        next = round3(qty);
        delta = round3(next - item.current_quantity);
      } else {
        delta = type === "used" ? -round3(qty) : round3(qty);
        next = round3(item.current_quantity + delta);
      }
      if (next < 0)
        throw new AppError(`Not enough stock (have ${item.current_quantity} ${item.unit})`);
      this.writeStock(itemId, type, next, item.current_quantity, note, createdBy);
      return { current_quantity: next };
    });
  }

  /** Sets an item's stock and logs the change in its history. */
  private writeStock(
    itemId: string,
    type: string,
    next: number,
    before: number,
    note: string | null | undefined,
    createdBy: string | null,
    orderId: string | null = null,
  ) {
    const at = now();
    this.run("UPDATE inventory_items SET current_quantity = $q, updated_at = $at WHERE id = $id", {
      q: next,
      at,
      id: itemId,
    });
    this.run(
      `INSERT INTO inventory_movements (id, item_id, movement_type, quantity_change, quantity_after, note, created_by, created_at, order_id)
       VALUES ($id, $item, $type, $delta, $after, $note, $by, $at, $order)`,
      {
        id: uuid(),
        item: itemId,
        type,
        delta: round3(next - before),
        after: next,
        note: note?.trim() || null,
        by: createdBy,
        at,
        order: orderId,
      },
    );
  }
}
