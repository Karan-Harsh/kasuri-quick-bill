import { describe, expect, test } from "bun:test";
import { estimatedWorkbook } from "../scripts/estimated-recipes";
import { openDatabase } from "./db";
import { importSetupWorkbook } from "./setup-sheet";
import { Store } from "./store";
import { writeXlsx } from "./xlsx";

describe("estimated recipes sheet", () => {
  test("uploads cleanly into a new install: every dish gets a recipe", () => {
    const store = new Store(openDatabase(":memory:"));
    const r = importSetupWorkbook(store, writeXlsx(estimatedWorkbook()), true);
    expect(r.problems).toEqual([]);
    expect(r.inventory.added).toBe(39);
    expect(r.menu).toMatchObject({ added: 0, updated: 0, unchanged: 249 });
    expect(r.recipes).toMatchObject({ dishes: 249, waiting: 0 });
    // Uploading never changes stock: every new item starts at zero.
    expect(store.inventoryItems().every((i) => Number(i.current_quantity) === 0)).toBe(true);
  });
});
