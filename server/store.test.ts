import { beforeEach, describe, expect, test } from "bun:test";
import { openDatabase } from "./db";
import { Store } from "./store";

let store: Store;
const menuItem = (name: string) => store.menuItems(false).find((m) => m.name === name)! as { id: string; price: number };
const tableId = (label: string) => (store.tables() as { id: string; label: string }[]).find((t) => t.label === label)!.id;

beforeEach(() => {
  store = new Store(openDatabase(":memory:"));
});

describe("first run", () => {
  test("seeds 8 tables, starter menu and GST off", () => {
    expect(store.tables()).toHaveLength(8);
    expect(store.menuItems(true).length).toBe(18);
    expect(store.settings()).toEqual({ id: 1, name: "Kasuri", gst_enabled: false });
  });
});

describe("orders", () => {
  test("bill numbers start at 1001 and are never reused", () => {
    const a = store.createOrder(null);
    expect(store.order(a.id).bill_number).toBe(1001);
    store.discardOrder(a.id);
    const b = store.createOrder(null);
    expect(store.order(b.id).bill_number).toBe(1002);
  });

  test("a table has only one open order", () => {
    const t1 = tableId("T1");
    const a = store.createOrder(t1);
    const b = store.createOrder(t1);
    expect(b).toEqual({ id: a.id, existing: true });
  });

  test("adding the same item twice merges into one line", () => {
    const o = store.createOrder(tableId("T2"));
    const naan = menuItem("Butter Naan");
    store.addItem(o.id, naan.id);
    store.addItem(o.id, naan.id);
    const lines = store.orderItems(o.id) as { quantity: number }[];
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
  });

  test("settling calculates totals on the server and records payment", () => {
    store.updateSettings({ gst_enabled: true });
    const o = store.createOrder(null);
    store.addItem(o.id, menuItem("Paneer Tikka").id); // 220 @5%
    store.addItem(o.id, menuItem("Cold Coffee").id); // 120 @18%
    const t = store.settle(o.id, { discount: 40, payment_method: "UPI" });
    // subtotal 340, discount 40 -> factor 300/340; tax (11 + 21.6) * 0.88235 = 28.76
    expect(t.subtotal).toBe(340);
    expect(t.taxAmount).toBe(28.76);
    expect(t.total).toBe(328.76);
    const receipt = store.receipt(o.id);
    expect(receipt.status).toBe("COMPLETED");
    expect(receipt.payment_method).toBe("UPI");
    expect(receipt.gst_applied).toBe(true);
    expect(() => store.addItem(o.id, menuItem("Dal Tadka").id)).toThrow("Order is not open");
  });

  test("cannot settle an empty bill", () => {
    const o = store.createOrder(null);
    expect(() => store.settle(o.id, {})).toThrow("Add at least one item");
  });

  test("inactive menu items cannot be ordered", () => {
    const o = store.createOrder(null);
    const chai = menuItem("Masala Chai");
    store.saveMenuItem(chai.id, { is_active: false });
    expect(() => store.addItem(o.id, chai.id)).toThrow("not available");
  });
});

describe("kitchen", () => {
  test("KOT holds only new items; order becomes ready when all tickets are done", () => {
    const o = store.createOrder(tableId("T3"));
    const naan = menuItem("Butter Naan");
    store.addItem(o.id, naan.id);
    store.addItem(o.id, naan.id);
    const kot1 = store.sendToKitchen(o.id);
    expect(kot1.kot_number).toBe(1);
    expect(() => store.sendToKitchen(o.id)).toThrow("No new items");

    // One more naan after sending: goes on a new line, so KOT 2 shows just 1.
    store.addItem(o.id, naan.id);
    const kot2 = store.sendToKitchen(o.id);
    expect(store.ticket(kot2.id).order_items).toEqual([expect.objectContaining({ item_name: "Butter Naan", quantity: 1 })]);
    expect(store.openTickets()).toHaveLength(2);

    store.completeTicket(kot1.id);
    expect(store.order(o.id).kitchen_ready_at).toBeNull();
    store.completeTicket(kot2.id);
    expect(store.order(o.id).kitchen_ready_at).not.toBeNull();
    expect(() => store.completeTicket(kot2.id)).toThrow("already done");

    store.acknowledgeReady(o.id);
    expect(store.order(o.id).kitchen_ready_at).toBeNull();
  });

  test("raising quantity of a sent line adds only the extra as unsent", () => {
    const o = store.createOrder(null);
    store.addItem(o.id, menuItem("Dal Tadka").id);
    store.sendToKitchen(o.id);
    const [sent] = store.orderItems(o.id) as { id: string }[];
    store.setItemQuantity(sent.id, 3);
    const lines = store.orderItems(o.id) as { quantity: number; kitchen_sent_at: string | null }[];
    expect(lines.map((l) => [l.quantity, l.kitchen_sent_at === null])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  test("kitchen screen shape includes table label and lines", () => {
    const o = store.createOrder(tableId("T5"));
    store.addItem(o.id, menuItem("Chicken 65").id);
    store.sendToKitchen(o.id);
    const [t] = store.openTickets() as Record<string, unknown>[];
    expect(t).toMatchObject({ table_label: "T5", order_type: "DINE_IN", bill_number: 1001, status: "OPEN" });
    expect(t.lines).toEqual([expect.objectContaining({ item_name: "Chicken 65", quantity: 1 })]);
  });
});

describe("inventory", () => {
  test("opening stock, use, receive, count and no negative stock", () => {
    const { id } = store.saveInventoryItem(null, { name: "Paneer", unit: "kg", opening_quantity: 5 });
    expect(store.recordMovement(id, "used", 1.5).current_quantity).toBe(3.5);
    expect(store.recordMovement(id, "received", 2).current_quantity).toBe(5.5);
    expect(store.recordMovement(id, "count", 4).current_quantity).toBe(4);
    expect(() => store.recordMovement(id, "used", 10)).toThrow("Not enough stock");
    const moves = store.inventoryMovements();
    expect(moves).toHaveLength(4);
    expect(moves[0]).toMatchObject({ movement_type: "count", quantity_change: -1.5, inventory_items: { name: "Paneer", unit: "kg" } });
  });

  test("duplicate names are rejected", () => {
    store.saveInventoryItem(null, { name: "Rice" });
    expect(() => store.saveInventoryItem(null, { name: "rice" })).toThrow("already");
  });
});

describe("reports", () => {
  test("only completed orders in range are included", () => {
    const a = store.createOrder(null);
    store.addItem(a.id, menuItem("Garlic Naan").id);
    store.settle(a.id, { payment_method: "CASH" });
    store.createOrder(null); // open, not counted
    const r = store.report("2000-01-01T00:00:00.000Z", "2999-01-01T00:00:00.000Z");
    expect(r.orders).toHaveLength(1);
    expect(r.lines).toEqual([{ item_name: "Garlic Naan", quantity: 1, unit_price: 60 }]);
    expect(store.todayStats("2000-01-01T00:00:00.000Z")).toEqual({ sales: 60, orders: 1, parcels: 1 });
  });
});
