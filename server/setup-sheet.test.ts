import { beforeEach, describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { openDatabase } from "./db";
import { buildSetupWorkbook, importSetupWorkbook } from "./setup-sheet";
import { Store } from "./store";
import { readXlsx, writeXlsx, type Cell, type Sheet } from "./xlsx";

let store: Store;
beforeEach(() => {
  store = new Store(openDatabase(":memory:", { starterMenu: "demo" }));
});

const book = (sheets: Record<string, Cell[][]>) =>
  writeXlsx(Object.entries(sheets).map(([name, rows]) => ({ name, rows })));

const stock = (name: string) =>
  (
    store.inventoryItems() as unknown as {
      name: string;
      unit: string;
      current_quantity: number;
      low_stock_level: number | null;
    }[]
  ).find((i) => i.name === name);
const dish = (name: string) =>
  (
    store.menuItems(false) as {
      id: string;
      name: string;
      price: number;
      tax_rate: number;
      is_active: boolean;
    }[]
  ).find((m) => m.name === name);

describe("xlsx", () => {
  test("writes and reads back text, numbers and empty cells", () => {
    const sheets: Sheet[] = [
      {
        name: "A & B",
        rows: [
          ["Name", "Qty"],
          ["Dal <makhani>", 2.5],
          [null, 3],
          ["Chai", null],
        ],
      },
    ];
    const [read] = readXlsx(writeXlsx(sheets));
    expect(read!.name).toBe("A & B");
    expect(read!.rows).toEqual([["Name", "Qty"], ["Dal <makhani>", 2.5], [null, 3], ["Chai"]]);
  });

  test("reads files the way Excel saves them (shared strings, rich text, skipped cells)", () => {
    const files = {
      "xl/workbook.xml": strToU8(
        `<workbook xmlns:r="r"><sheets><sheet name="Menu" sheetId="1" r:id="rId3"/></sheets></workbook>`,
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        `<Relationships><Relationship Id="rId3" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>`,
      ),
      "xl/sharedStrings.xml": strToU8(
        `<sst><si><t>Dish</t></si><si><r><t>Paneer </t></r><r><rPr><b/></rPr><t>Tikka</t></r></si></sst>`,
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="str"><v>x &amp; y</v></c></row>` +
          `<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" s="2"/><c r="C3"><v>220</v></c></row></sheetData></worksheet>`,
      ),
    };
    const [sheet] = readXlsx(zipSync(files));
    expect(sheet!.rows).toEqual([["Dish", null, "x & y"], [], ["Paneer Tikka", null, 220]]);
  });

  test("rejects files that aren't .xlsx", () => {
    expect(() => importSetupWorkbook(store, strToU8("Name,Price\nChai,30"), true)).toThrow(
      "isn't an Excel",
    );
  });
});

describe("setup sheet", () => {
  test("the downloaded sheet uploads back with nothing changed", () => {
    store.saveInventoryItem(null, {
      name: "Onion",
      unit: "kg",
      opening_quantity: 20,
      low_stock_level: 5,
    });
    const onion = store.inventoryItems()[0] as { id: string };
    store.saveMenuItem(dish("Dal Tadka")!.id, {
      ingredients: [{ inventory_item_id: onion.id, quantity: 50, unit: "g" }],
    });
    const bytes = writeXlsx(buildSetupWorkbook(store));
    const r = importSetupWorkbook(store, bytes, true);
    expect(r.problems).toEqual([]);
    expect(r.inventory).toEqual({ added: 0, updated: 0, unchanged: 1 });
    expect(r.menu).toMatchObject({ added: 0, updated: 0, unchanged: 18 });
    // Dal Tadka has a recipe; the other 17 dishes are listed with only their name.
    expect(r.recipes).toEqual({ dishes: 1, lines: 1, waiting: 17 });
  });

  test("adds stock, dishes, categories and recipes in one upload", () => {
    const bytes = book({
      Inventory: [
        ["Stock item", "Unit", "Stock now", "Warn below"],
        ["Onion", "KG", 100, 5],
        ["Rice", "kgs", "25", null],
        ["Milk", "litre", 10, 2],
      ],
      Menu: [
        ["Category", "Dish", "Price (₹)", "GST %", "Available"],
        ["Rice", "Veg Biryani", "₹220", null, null],
        ["Main Course", "dal tadka", 190, 5, "Yes"], // existing dish, different case: updated
      ],
      Recipes: [
        ["Dish", "Stock item", "Quantity per portion", "Unit"],
        ["Veg Biryani", "Rice", 150, "grams"],
        ["Veg Biryani", "onion", 50, "g"],
        ["Masala Chai", "Milk", 150, "ml"],
      ],
    });

    const check = importSetupWorkbook(store, bytes, false);
    expect(check).toMatchObject({
      applied: false,
      problems: [],
      inventory: { added: 3 },
      menu: { added: 1, updated: 1, categoriesAdded: 1 },
      recipes: { dishes: 2, lines: 3 },
    });
    // Checking saves nothing.
    expect(stock("Onion")).toBeUndefined();
    expect(dish("Veg Biryani")).toBeUndefined();

    const done = importSetupWorkbook(store, bytes, true);
    expect(done.applied).toBe(true);
    expect(stock("Onion")).toMatchObject({ unit: "kg", current_quantity: 100, low_stock_level: 5 });
    expect(stock("Milk")).toMatchObject({ unit: "L" });
    expect(dish("Veg Biryani")).toMatchObject({ price: 220, tax_rate: 5, is_active: true });
    expect(dish("Dal Tadka")!.price).toBe(190);
    const biryani = (
      store.menuIngredients() as {
        menu_item_id: string;
        inventory_name: string;
        quantity: number;
        unit: string;
      }[]
    )
      .filter((r) => r.menu_item_id === dish("Veg Biryani")!.id)
      .map((r) => [r.inventory_name, r.quantity, r.unit]);
    expect(biryani).toEqual([
      ["Onion", 50, "g"],
      ["Rice", 150, "g"],
    ]);
  });

  test("dishes can be listed now and their ingredients filled in later", () => {
    const sheet = writeXlsx(buildSetupWorkbook(store));
    const recipes = readXlsx(sheet).find((x) => x.name === "Recipes")!.rows;
    // Every dish is on the Recipes sheet, each with one row holding only its name.
    expect(recipes).toHaveLength(1 + 18);
    expect(recipes[1]).toEqual(["Chicken 65"]); // by category, then A–Z

    store.saveInventoryItem(null, { name: "Paneer", unit: "kg" });
    const r = importSetupWorkbook(
      store,
      book({
        Recipes: [
          ["Dish", "Stock item", "Quantity per portion", "Unit"],
          ["Paneer Tikka", "Paneer", 200, "g"], // filled in
          ["Paneer Tikka", null, null, null], // a spare blank row for the same dish
          ["Chicken 65", null, null, null], // not known yet
          ["Dal Tadka", null, 50, "g"], // half filled: an error
        ],
      }),
      false,
    );
    expect(r.recipes).toMatchObject({ dishes: 1, lines: 1, waiting: 1 });
    expect(r.problems).toEqual([
      expect.objectContaining({ row: 5, message: expect.stringContaining("Stock item is empty") }),
    ]);
  });

  test("changing stock on an existing item is saved as a stock count", () => {
    store.saveInventoryItem(null, { name: "Paneer", unit: "kg", opening_quantity: 4 });
    importSetupWorkbook(
      store,
      book({
        Inventory: [
          ["Stock item", "Unit", "Stock now"],
          ["Paneer", "kg", 6],
        ],
      }),
      true,
    );
    expect(stock("Paneer")!.current_quantity).toBe(6);
    expect(store.inventoryMovements(1)[0]).toMatchObject({
      movement_type: "count",
      quantity_change: 2,
      note: "Excel upload",
    });
  });

  test("any problem means nothing is saved, and each problem names its row", () => {
    const r = importSetupWorkbook(
      store,
      book({
        Inventory: [
          ["Stock item", "Unit", "Stock now"],
          ["Onion", "kg", 10],
          ["Ghee", "bucket", 2],
          ["onion", "kg", 3],
        ],
        Menu: [
          ["Category", "Dish", "Price (₹)", "Available"],
          ["Snacks", "Samosa", "twenty", null],
          ["", "Kachori", 30, "maybe"],
        ],
        Recipes: [
          ["Dish", "Stock item", "Quantity per portion", "Unit"],
          ["Dal Tadka", "Onion", 50, "ml"],
          ["Unknown Dish", "Onion", 50, "g"],
        ],
      }),
      true,
    );
    expect(r.applied).toBe(false);
    expect(r.problems.map((p) => [p.sheet, p.row])).toEqual([
      ["Inventory", 3],
      ["Inventory", 4],
      ["Menu", 2],
      ["Menu", 3],
      ["Recipes", 2],
      ["Recipes", 3],
    ]);
    expect(r.problems[0]!.message).toContain('Unknown unit "bucket"');
    expect(r.problems[1]!.message).toContain("also on row 2");
    expect(r.problems[4]!.message).toContain("use g or kg here, not ml");
    expect(stock("Onion")).toBeUndefined();
    expect(store.categories()).toHaveLength(4);
  });

  test("a sheet without the needed headings is reported", () => {
    const r = importSetupWorkbook(
      store,
      book({
        Menu: [
          ["Item", "Cost"],
          ["Chai", 30],
        ],
      }),
      true,
    );
    expect(r.problems).toEqual([
      expect.objectContaining({
        sheet: "Menu",
        row: 1,
        message: expect.stringContaining('"Price (₹)"'),
      }),
    ]);
  });

  test("a file without any of the three sheets is refused", () => {
    expect(() => importSetupWorkbook(store, book({ Sheet1: [["a"]] }), true)).toThrow(
      'No "Inventory", "Menu" or "Recipes" sheet',
    );
  });
});
