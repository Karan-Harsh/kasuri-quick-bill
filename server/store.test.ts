import { beforeEach, describe, expect, test } from "bun:test";
import { openDatabase } from "./db";
import { Store } from "./store";

let store: Store;
const menuItem = (name: string) =>
  store.menuItems(false).find((m) => m.name === name)! as { id: string; price: number };
const tableId = (label: string) =>
  (store.tables() as { id: string; label: string }[]).find((t) => t.label === label)!.id;

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
    expect(store.ticket(kot2.id).order_items).toEqual([
      expect.objectContaining({ item_name: "Butter Naan", quantity: 1 }),
    ]);
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
    expect(t).toMatchObject({
      table_label: "T5",
      order_type: "DINE_IN",
      bill_number: 1001,
      status: "OPEN",
    });
    expect(t.lines).toEqual([expect.objectContaining({ item_name: "Chicken 65", quantity: 1 })]);
  });
});

describe("inventory", () => {
  test("opening stock, use, receive, count and no negative stock", () => {
    const { id } = store.saveInventoryItem(null, {
      name: "Paneer",
      unit: "kg",
      opening_quantity: 5,
    });
    expect(store.recordMovement(id, "used", 1.5).current_quantity).toBe(3.5);
    expect(store.recordMovement(id, "received", 2).current_quantity).toBe(5.5);
    expect(store.recordMovement(id, "count", 4).current_quantity).toBe(4);
    expect(() => store.recordMovement(id, "used", 10)).toThrow("Not enough stock");
    const moves = store.inventoryMovements();
    expect(moves).toHaveLength(4);
    expect(moves[0]).toMatchObject({
      movement_type: "count",
      quantity_change: -1.5,
      inventory_items: { name: "Paneer", unit: "kg" },
    });
  });

  test("duplicate names are rejected", () => {
    store.saveInventoryItem(null, { name: "Rice" });
    expect(() => store.saveInventoryItem(null, { name: "rice" })).toThrow("already");
  });
});

describe("recipes and low stock", () => {
  const stock = (id: string) =>
    (store.inventoryItems() as { id: string; current_quantity: number }[]).find((i) => i.id === id)!
      .current_quantity;

  test("settling a bill takes each dish's ingredients out of stock, in the stock's unit", () => {
    const onion = store.saveInventoryItem(null, {
      name: "Onion",
      unit: "kg",
      opening_quantity: 100,
    });
    const rice = store.saveInventoryItem(null, { name: "Rice", unit: "kg", opening_quantity: 10 });
    const dal = menuItem("Dal Tadka");
    const kadai = menuItem("Mixed Veg Kadai");
    store.saveMenuItem(dal.id, {
      ingredients: [
        { inventory_item_id: onion.id, quantity: 50, unit: "g" },
        { inventory_item_id: rice.id, quantity: 40, unit: "g" },
      ],
    });
    store.saveMenuItem(kadai.id, {
      ingredients: [{ inventory_item_id: onion.id, quantity: 0.1, unit: "kg" }],
    });

    const o = store.createOrder(null);
    store.addItem(o.id, dal.id);
    store.addItem(o.id, dal.id); // 2 dal
    store.addItem(o.id, kadai.id); // 1 kadai
    expect(stock(onion.id)).toBe(100); // nothing used until the bill is settled
    store.settle(o.id, { payment_method: "CASH" });

    expect(stock(onion.id)).toBe(99.8); // 2 × 50 g + 100 g
    expect(stock(rice.id)).toBe(9.92); // 2 × 40 g
    const [latest] = store.inventoryMovements(1);
    expect(latest).toMatchObject({ movement_type: "used", note: "Bill #1001" });
  });

  test("billing never fails for lack of stock; stock stops at zero", () => {
    const paneer = store.saveInventoryItem(null, {
      name: "Paneer",
      unit: "kg",
      opening_quantity: 0.1,
    });
    const tikka = menuItem("Paneer Tikka");
    store.saveMenuItem(tikka.id, {
      ingredients: [{ inventory_item_id: paneer.id, quantity: 200, unit: "g" }],
    });
    const o = store.createOrder(null);
    store.addItem(o.id, tikka.id);
    expect(() => store.settle(o.id, {})).not.toThrow();
    expect(stock(paneer.id)).toBe(0);
  });

  test("discarded bills and inactive stock items use nothing", () => {
    const milk = store.saveInventoryItem(null, { name: "Milk", unit: "L", opening_quantity: 5 });
    const chai = menuItem("Masala Chai");
    store.saveMenuItem(chai.id, {
      ingredients: [{ inventory_item_id: milk.id, quantity: 150, unit: "ml" }],
    });
    const a = store.createOrder(null);
    store.addItem(a.id, chai.id);
    store.discardOrder(a.id);
    store.setInventoryActive(milk.id, false);
    const b = store.createOrder(null);
    store.addItem(b.id, chai.id);
    store.settle(b.id, {});
    expect(stock(milk.id)).toBe(5);
  });

  test("recipe units must match the stock unit's kind", () => {
    const milk = store.saveInventoryItem(null, { name: "Milk", unit: "L" });
    const chai = menuItem("Masala Chai");
    expect(() =>
      store.saveMenuItem(chai.id, {
        ingredients: [{ inventory_item_id: milk.id, quantity: 100, unit: "g" }],
      }),
    ).toThrow("can't be measured in g");
    store.saveMenuItem(chai.id, {
      ingredients: [{ inventory_item_id: milk.id, quantity: 100, unit: "ml" }],
    });
    // Changing Milk to kg would break the chai recipe.
    expect(() => store.saveInventoryItem(milk.id, { name: "Milk", unit: "kg" })).toThrow(
      "Dishes use Milk in ml",
    );
    expect(store.menuIngredients()).toEqual([
      expect.objectContaining({
        menu_item_id: chai.id,
        quantity: 100,
        unit: "ml",
        inventory_name: "Milk",
      }),
    ]);
  });

  test("minimum stock level is saved and kept when not sent", () => {
    const onion = store.saveInventoryItem(null, { name: "Onion", unit: "kg", low_stock_level: 5 });
    const level = () =>
      (store.inventoryItems() as { id: string; low_stock_level: number | null }[]).find(
        (i) => i.id === onion.id,
      )!.low_stock_level;
    expect(level()).toBe(5);
    store.saveInventoryItem(onion.id, { name: "Onions", unit: "kg" });
    expect(level()).toBe(5);
    store.saveInventoryItem(onion.id, { name: "Onions", unit: "kg", low_stock_level: null });
    expect(level()).toBeNull();
    expect(() =>
      store.saveInventoryItem(onion.id, { name: "Onions", low_stock_level: -1 }),
    ).toThrow("Minimum stock");
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
    expect(r.orders[0]).toMatchObject({
      bill_number: 1001,
      order_type: "PARCEL",
      table_label: null,
      item_count: 1,
      total: 60,
    });
    expect(r.lines).toEqual([{ item_name: "Garlic Naan", quantity: 1, unit_price: 60 }]);
    expect(store.todayStats("2000-01-01T00:00:00.000Z")).toEqual({
      sales: 60,
      orders: 1,
      parcels: 1,
    });
  });
});
