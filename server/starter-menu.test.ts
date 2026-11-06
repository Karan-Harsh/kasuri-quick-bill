import { describe, expect, test } from "bun:test";
import { openDatabase, replaceUntouchedDemoMenu } from "./db";
import { Store } from "./store";

const dishes = (store: Store) =>
  store.menuItems(false) as { id: string; name: string; price: number }[];

describe("starting menu", () => {
  test("a new database starts with the Kasuri menu, half and full as separate dishes", () => {
    const store = new Store(openDatabase(":memory:"));
    const cats = store.categories() as { id: string; name: string }[];
    expect(cats).toHaveLength(22);
    expect(cats[0]!.name).toBe("Soup (Veg)");
    expect(cats.at(-1)!.name).toBe("Pure Veg Specials");
    expect(dishes(store)).toHaveLength(249);
    const byName = new Map(dishes(store).map((d) => [d.name, d.price]));
    expect(byName.get("Paneer Chilli (Half)")).toBe(130);
    expect(byName.get("Paneer Chilli (Full)")).toBe(190);
    expect(byName.get("Veg Manchow")).toBe(90); // one price: plain name
    expect(byName.has("Paneer Chilli")).toBe(false);
    expect(byName.has("Cold Drink")).toBe(false); // sold at M.R.P.
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
    expect(dishes(store)).toHaveLength(249);
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
