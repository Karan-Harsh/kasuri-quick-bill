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
