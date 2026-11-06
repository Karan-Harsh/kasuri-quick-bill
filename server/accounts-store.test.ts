import { beforeEach, describe, expect, test } from "bun:test";
import { openDatabase } from "./db";
import { Store } from "./store";

let store: Store;
beforeEach(() => {
  store = new Store(openDatabase(":memory:", { starterMenu: "demo" }));
});
const today = () => new Date().toLocaleDateString("en-CA");
const month = () => today().slice(0, 7);
const menuItem = (name: string) =>
  (store.menuItems(false) as { id: string; name: string }[]).find((m) => m.name === name)!;

describe("expenses", () => {
  test("adds, lists, matches category spelling and deletes", () => {
    store.accounts.addExpense({ date: today(), category: "rent", amount: 20000, note: "Nov" });
    const [e] = store.accounts.expenses(today(), today());
    expect(e).toMatchObject({ category: "Rent", amount: 20000, note: "Nov" });
    expect(() => store.accounts.addExpense({ date: today(), category: "Gas", amount: 0 })).toThrow(
      "more than 0",
    );
    store.accounts.addExpense({ date: today(), category: "Tiffin boxes", amount: 300 });
    expect(store.accounts.expenseCategories()).toContain("Tiffin boxes");
    store.accounts.deleteExpense(e!.id);
    expect(store.accounts.expenses(today(), today())).toHaveLength(1);
  });

  test("each stock item shows the price per unit of its latest priced delivery", () => {
    const { id } = store.saveInventoryItem(null, { name: "Onion", unit: "kg" });
    store.recordMovement(id, "received", 10, null, null, 427.5); // ₹42.75/kg
    store.recordMovement(id, "received", 4, null, null, 150); // ₹37.50/kg, the next day
    store.recordMovement(id, "received", 2); // no price entered: doesn't replace the last price
    const onion = store.inventoryItems().find((i) => i.id === id)!;
    expect(onion.last_price).toBe(37.5);
    expect(onion.last_price_at).toBeTruthy();
    const salt = store.saveInventoryItem(null, { name: "Salt", unit: "kg" });
    expect(store.inventoryItems().find((i) => i.id === salt.id)!.last_price).toBeNull();
  });

  test("amount paid can only go on stock received", () => {
    const { id } = store.saveInventoryItem(null, { name: "Rice", unit: "kg" });
    store.recordMovement(id, "received", 25, null, null, 1500);
    expect(store.inventoryMovements(1)[0]).toMatchObject({ cost: 1500 });
    expect(() => store.recordMovement(id, "used", 1, null, null, 50)).toThrow("only be entered");
  });
});

describe("profit and loss", () => {
  test("sales minus ingredients, salaries and expenses for the month", () => {
    store.updateSettings({ gst_enabled: true });
    // Two bills: 220 with 20 off (GST 5% on 200 = 10), and 120 (GST 18% = 21.6).
    const a = store.createOrder(null);
    store.addItem(a.id, menuItem("Paneer Tikka").id);
    store.settle(a.id, { discount: 20 });
    const b = store.createOrder(null);
    store.addItem(b.id, menuItem("Cold Coffee").id);
    store.settle(b.id, {});
    // A cancelled bill doesn't count.
    const c = store.createOrder(null);
    store.addItem(c.id, menuItem("Dal Tadka").id);
    store.settle(c.id, {});
    store.cancelBill(c.id);

    const { id: rice } = store.saveInventoryItem(null, { name: "Rice", unit: "kg" });
    store.recordMovement(rice, "received", 25, null, null, 1500);
    store.recordMovement(rice, "received", 5); // price not entered

    const r = store.staff.createEmployee({
      name: "Ravi",
      monthly_salary: 18000,
      join_date: `${month()}-01`,
    });
    // An advance is part of the salary, not an extra cost.
    store.staff.addAdjustment({ employee_id: r.id, type: "advance", amount: 3000, date: today() });

    store.accounts.addExpense({ date: today(), category: "Rent", amount: 20000 });
    store.accounts.addExpense({ date: today(), category: "Gas", amount: 1200 });

    const { months, total } = store.accounts.profitAndLoss(month(), month());
    expect(months).toHaveLength(1);
    expect(total).toMatchObject({
      bills: 2,
      sales: 320,
      gst: 31.6,
      ingredients: 1500,
      unpricedDeliveries: 1,
      salaries: 18000,
      salariesEstimated: true,
      expenses: 21200,
      expensesByCategory: { Rent: 20000, Gas: 1200 },
      profit: 320 - 1500 - 18000 - 21200,
    });
  });

  test("stock returned by a cancelled bill isn't counted as a purchase", () => {
    const { id: paneer } = store.saveInventoryItem(null, {
      name: "Paneer",
      unit: "kg",
      opening_quantity: 2,
    });
    store.saveMenuItem(menuItem("Paneer Tikka").id, {
      ingredients: [{ inventory_item_id: paneer, quantity: 200, unit: "g" }],
    });
    const o = store.createOrder(null);
    store.addItem(o.id, menuItem("Paneer Tikka").id);
    store.settle(o.id, {});
    store.cancelBill(o.id);
    expect(store.accounts.profitAndLoss(month(), month()).total).toMatchObject({
      ingredients: 0,
      unpricedDeliveries: 0,
      sales: 0,
    });
  });

  test("checks the month range", () => {
    expect(() => store.accounts.profitAndLoss("2026-05", "2026-01")).toThrow("after");
    expect(() => store.accounts.profitAndLoss("2020-01", "2026-01")).toThrow("3 years");
    expect(store.accounts.profitAndLoss("2025-11", "2026-01").months.map((m) => m.month)).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
  });
});
