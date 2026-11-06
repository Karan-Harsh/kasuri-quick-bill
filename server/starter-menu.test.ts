import { describe, expect, test } from "bun:test";
import { mergeHalfFullPairs, openDatabase, replaceUntouchedDemoMenu } from "./db";
import { Store } from "./store";

const dishes = (store: Store) =>
  store.menuItems(false) as {
    id: string;
    name: string;
    price: number;
    half_price: number | null;
  }[];

describe("starting menu", () => {
  test("a new database starts with the Kasuri menu: one dish each, with a half price", () => {
    const store = new Store(openDatabase(":memory:"));
    const cats = store.categories() as { id: string; name: string }[];
    expect(cats).toHaveLength(22);
    expect(cats[0]!.name).toBe("Soup (Veg)");
    expect(cats.at(-1)!.name).toBe("Pure Veg Specials");
    const all = dishes(store);
    expect(all).toHaveLength(183);
    const chilli = all.find((d) => d.name === "Paneer Chilli")!;
    expect(chilli).toMatchObject({ price: 190, half_price: 130 });
    expect(all.find((d) => d.name === "Veg Manchow")).toMatchObject({
      price: 90,
      half_price: null,
    });
    expect(all.filter((d) => d.half_price != null)).toHaveLength(66);
    expect(all.some((d) => d.name.endsWith("(Half)"))).toBe(false);
    expect(all.some((d) => d.name === "Cold Drink")).toBe(false); // sold at M.R.P.
  });

  test("…and with starting stock items (with prices) and a recipe for every dish", () => {
    const store = new Store(openDatabase(":memory:"));
    const stock = store.inventoryItems();
    expect(stock).toHaveLength(39);
    expect(stock.every((i) => Number(i.current_quantity) === 0 && i.price_per_unit != null)).toBe(
      true,
    );
    expect(stock.find((i) => i.name === "Onion")).toMatchObject({
      unit: "kg",
      price_per_unit: 35,
      low_stock_level: 5,
    });
    // Not counted yet, so nothing shows as running low on a fresh install.
    expect(stock.every((i) => i.tracked === false)).toBe(true);
    const withRecipe = new Set(
      (store.menuIngredients() as { menu_item_id: string }[]).map((r) => r.menu_item_id),
    );
    expect(dishes(store).every((d) => withRecipe.has(d.id))).toBe(true);
  });

  test("a half plate is billed at the half price and uses 60% of the recipe", () => {
    const store = new Store(openDatabase(":memory:"));
    const paneer = store.inventoryItems().find((i) => i.name === "Paneer")!;
    store.recordMovement(String(paneer.id), "received", 1);
    const chilli = dishes(store).find((d) => d.name === "Paneer Chilli")!;
    const o = store.createOrder(null);
    store.addItem(o.id, chilli.id, "half");
    store.addItem(o.id, chilli.id, "half");
    store.addItem(o.id, chilli.id); // full
    const lines = store.orderItems(o.id) as {
      item_name: string;
      unit_price: number;
      quantity: number;
    }[];
    expect(lines.map((l) => [l.item_name, l.unit_price, l.quantity])).toEqual([
      ["Paneer Chilli (Half)", 130, 2],
      ["Paneer Chilli", 190, 1],
    ]);
    store.settle(o.id, {});
    // Full recipe has 150 g paneer: 2 halves (2 × 90 g) + 1 full (150 g) = 330 g.
    const after = store.inventoryItems().find((i) => i.name === "Paneer")!;
    expect(Number(after.current_quantity)).toBe(0.67);
    const veg = dishes(store).find((d) => d.name === "Veg Manchow")!;
    expect(() => store.addItem(store.createOrder(null).id, veg.id, "half")).toThrow(
      "no half plate",
    );
  });

  test("old Half/Full dish pairs are merged into one dish with a half price", () => {
    const db = openDatabase(":memory:", { starterMenu: "demo" });
    const store = new Store(db);
    const cat = (store.categories() as { id: string }[])[0]!.id;
    store.saveMenuItem(null, { name: "Paneer Chilli (Half)", category_id: cat, price: 130 });
    const full = store.saveMenuItem(null, {
      name: "Paneer Chilli (Full)",
      category_id: cat,
      price: 190,
    });
    expect(mergeHalfFullPairs(db)).toBe(1);
    expect(dishes(store).find((d) => d.id === full.id)).toMatchObject({
      name: "Paneer Chilli",
      price: 190,
      half_price: 130,
    });
    expect(dishes(store).some((d) => d.name.startsWith("Paneer Chilli ("))).toBe(false);
    expect(mergeHalfFullPairs(db)).toBe(0);
  });

  test("a new database also starts with Kasuri's 7 staff, paid from their joining date", () => {
    const store = new Store(openDatabase(":memory:"));
    const staff = store.staff.employees();
    expect(staff.map((e) => e.name).sort()).toEqual([
      "Bidhan",
      "Bijoy",
      "Bishnu",
      "Chiranjeet",
      "Dipankar",
      "Ranjeet",
      "Rupchand",
    ]);
    expect(staff.find((e) => e.name === "Ranjeet")).toMatchObject({
      role: "Cleaner",
      join_date: "2026-09-30",
      monthly_salary: 8000,
    });
    // Ranjeet's November period: 30 Oct – 29 Nov.
    const ranjeet = store.staff.payroll("2026-11").find((p) => p.line.name === "Ranjeet")!;
    expect(ranjeet.line).toMatchObject({ period_start: "2026-10-30", period_end: "2026-11-29" });
    // Test databases (demo menu) start with no staff.
    expect(new Store(openDatabase(":memory:", { starterMenu: "demo" })).staff.employees()).toEqual(
      [],
    );
  });

  test("an untouched demo menu is replaced; past bills keep their dish names", () => {
    const db = openDatabase(":memory:", { starterMenu: "demo" });
    const store = new Store(db);
    const o = store.createOrder(null);
    store.addItem(o.id, dishes(store).find((d) => d.name === "Chicken 65")!.id);
    store.settle(o.id, {});
    expect(replaceUntouchedDemoMenu(db)).toBe(true);
    expect(dishes(store)).toHaveLength(183);
    expect(dishes(store).some((d) => d.name === "Chicken 65")).toBe(false);
    expect(store.receipt(o.id).order_items).toEqual([
      expect.objectContaining({ item_name: "Chicken 65", unit_price: 260 }),
    ]);
    expect(replaceUntouchedDemoMenu(db)).toBe(false); // only once
  });

  test("a demo menu that was changed is left alone", () => {
    const db = openDatabase(":memory:", { starterMenu: "demo" });
    const store = new Store(db);
    const naan = dishes(store).find((d) => d.name === "Butter Naan")!;
    store.saveMenuItem(naan.id, { price: 50 });
    expect(replaceUntouchedDemoMenu(db)).toBe(false);
    expect(dishes(store)).toHaveLength(18);
  });
});
