// The Excel setup sheet: download the menu, stock items and recipes as one workbook, fill it in,
// and upload it to add or update everything at once.
//
// Rules (also written on the workbook's "How to use" sheet):
//   - Rows are matched by name (capital letters don't matter; the spelling already in Kasuri is kept).
//     New names are added; known names updated.
//   - Nothing is deleted: removing a row from the sheet leaves that item as it is.
//   - A dish listed on the Recipes sheet gets exactly the ingredients listed there; dishes not listed
//     keep their recipe.
//   - The upload is checked first. If any row has a problem, nothing is saved.
import { compatibleUnits, INVENTORY_UNITS, normalizeUnit } from "../src/lib/inventory";
import { AppError, type IngredientInput, type Store } from "./store";
import { readXlsx, XlsxError, type Cell, type Sheet } from "./xlsx";

export interface ImportProblem {
  sheet: string;
  /** Excel row number, as shown at the left edge of Excel. */
  row: number;
  message: string;
}

export interface ImportResult {
  /** True when the changes were saved; false for a check-only run or when there were problems. */
  applied: boolean;
  problems: ImportProblem[];
  inventory: { added: number; updated: number; unchanged: number };
  menu: { added: number; updated: number; unchanged: number; categoriesAdded: number };
  recipes: { dishes: number; lines: number };
}

const SHEETS = {
  inventory: "Inventory",
  menu: "Menu",
  recipes: "Recipes",
} as const;

// Column headings. Uploads find columns by heading (in any order); a few other wordings are accepted.
const COLUMNS = {
  inventory: {
    name: { title: "Stock item", aliases: ["name", "item", "stockitem", "ingredient"] },
    unit: { title: "Unit", aliases: ["unit", "units"] },
    stock: {
      title: "Stock now",
      aliases: ["stocknow", "stock", "currentstock", "quantity", "qty"],
    },
    warn: {
      title: "Warn below",
      aliases: ["warnbelow", "minimum", "minimumstock", "minstock", "lowstock", "lowstocklevel"],
    },
  },
  menu: {
    category: { title: "Category", aliases: ["category"] },
    dish: { title: "Dish", aliases: ["dish", "name", "item", "dishname"] },
    price: { title: "Price (₹)", aliases: ["price", "rate", "mrp"] },
    gst: { title: "GST %", aliases: ["gst", "gstrate", "tax", "taxrate"] },
    available: { title: "Available", aliases: ["available", "active"] },
  },
  recipes: {
    dish: { title: "Dish", aliases: ["dish", "dishname", "menuitem"] },
    stock: { title: "Stock item", aliases: ["stockitem", "ingredient", "item", "name"] },
    qty: {
      title: "Quantity per portion",
      aliases: ["quantityperportion", "quantity", "qty", "perportion", "amount"],
    },
    unit: { title: "Unit", aliases: ["unit", "units"] },
  },
} as const;

const HOW_TO = [
  ["Kasuri setup sheet"],
  [""],
  [
    "Fill in the Inventory, Menu and Recipes sheets, save the file, and upload it in Kasuri → Settings → Excel setup.",
  ],
  [
    "Kasuri checks everything first. If any row has a problem, nothing is saved and you are told which row to fix.",
  ],
  [""],
  ["How rows are matched"],
  [
    "• Rows are matched by name (capital letters don't matter). New names are added, existing ones are updated.",
  ],
  ["• Nothing is deleted. Removing a row here leaves that item in Kasuri as it is."],
  ["• Keep the first row of each sheet (the headings) as it is."],
  [""],
  ["Inventory sheet — the stock you keep"],
  [`• Unit: one of ${INVENTORY_UNITS.join(", ")}.`],
  [
    "• Stock now: how much you have today. For an existing item, a different number is saved as a stock count. Leave it empty to keep the current stock.",
  ],
  [
    "• Warn below: Kasuri warns when stock goes below this amount (same unit). Leave it empty for no warning.",
  ],
  ["  Example:  Onion | kg | 100 | 5"],
  [""],
  ["Menu sheet — your dishes"],
  ["• Category: a new category name is added automatically."],
  ["• Price (₹): price before GST.  GST %: e.g. 5. Empty = 5% for a new dish."],
  ["• Available: Yes or No. Empty = Yes for a new dish."],
  ["  Example:  Main Course | Veg Biryani | 220 | 5 | Yes"],
  [""],
  ["Recipes sheet — what one portion of a dish uses"],
  ["• One row per ingredient. A dish with 3 ingredients has 3 rows."],
  [
    "• The dish must be on the Menu sheet (or already in Kasuri), and the stock item on the Inventory sheet (or already in Kasuri).",
  ],
  [
    "• Unit can be smaller than the stock's unit: g for stock kept in kg, ml for L, pcs for dozen. Empty = the stock's own unit.",
  ],
  ["• A dish listed here gets exactly these ingredients. Dishes not listed keep their recipe."],
  ["  Example:  Veg Biryani | Rice | 150 | g"],
  ["            Veg Biryani | Onion | 50 | g"],
] satisfies Cell[][];

const yesNo = (b: boolean) => (b ? "Yes" : "No");

/** The workbook to download: current stock items, dishes and recipes, ready to edit. */
export function buildSetupWorkbook(store: Store): Sheet[] {
  const categories = store.categories() as { id: string; name: string; sort_order: number }[];
  const catOrder = new Map(categories.map((c, i) => [c.id, i]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const dishes = (
    store.menuItems(false) as {
      id: string;
      name: string;
      price: number;
      tax_rate: number;
      is_active: boolean;
      category_id: string;
    }[]
  ).sort(
    (a, b) =>
      (catOrder.get(a.category_id) ?? 0) - (catOrder.get(b.category_id) ?? 0) ||
      a.name.localeCompare(b.name),
  );
  const dishName = new Map(dishes.map((d) => [d.id, d.name]));
  const stock = store.inventoryItems().filter((i) => i.is_active) as unknown as {
    name: string;
    unit: string;
    current_quantity: number;
    low_stock_level: number | null;
  }[];
  const recipes = (
    store.menuIngredients() as {
      menu_item_id: string;
      inventory_name: string;
      quantity: number;
      unit: string;
    }[]
  ).sort(
    (a, b) =>
      dishes.findIndex((d) => d.id === a.menu_item_id) -
        dishes.findIndex((d) => d.id === b.menu_item_id) ||
      a.inventory_name.localeCompare(b.inventory_name),
  );
  const titles = <T extends Record<string, { title: string }>>(cols: T) =>
    Object.values(cols).map((c) => c.title);

  return [
    {
      name: "How to use",
      rows: HOW_TO,
      widths: [140],
      // Section titles: lines right after an empty line (after the intro).
      bold: HOW_TO.flatMap((r, i) => (i > 2 && HOW_TO[i - 1]![0] === "" && r[0] !== "" ? [i] : [])),
    },
    {
      name: SHEETS.inventory,
      widths: [28, 10, 12, 12],
      rows: [
        titles(COLUMNS.inventory),
        ...stock.map((i) => [i.name, i.unit, Number(i.current_quantity), i.low_stock_level]),
      ],
    },
    {
      name: SHEETS.menu,
      widths: [20, 32, 12, 8, 11],
      rows: [
        titles(COLUMNS.menu),
        ...dishes.map((d) => [
          catName.get(d.category_id) ?? "",
          d.name,
          Number(d.price),
          Number(d.tax_rate),
          yesNo(d.is_active),
        ]),
      ],
    },
    {
      name: SHEETS.recipes,
      widths: [32, 28, 22, 10],
      rows: [
        titles(COLUMNS.recipes),
        ...recipes.map((r) => [
          dishName.get(r.menu_item_id) ?? "",
          r.inventory_name,
          r.quantity,
          r.unit,
        ]),
      ],
    },
  ];
}

// ---------- reading the upload ----------

const key = (s: string) => s.trim().toLowerCase();
const headingKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z]/g, "");
const str = (c: Cell | undefined) => (c == null ? "" : String(c).trim());

/** Reads a number cell: "₹1,200", "5%" and "12.5" all work. null when empty, NaN when not a number. */
function num(c: Cell | undefined): number | null {
  if (c == null || str(c) === "") return null;
  if (typeof c === "number") return c;
  const cleaned = String(c)
    .replace(/[₹,%\s]/g, "")
    .replace(/^rs\.?/i, "");
  return cleaned === "" ? NaN : Number(cleaned);
}

function yes(c: Cell | undefined): boolean | null | "bad" {
  const s = key(str(c));
  if (s === "") return null;
  if (["yes", "y", "true", "1", "active", "available", "on"].includes(s)) return true;
  if (["no", "n", "false", "0", "inactive", "off"].includes(s)) return false;
  return "bad";
}

interface Table<K extends string> {
  name: string;
  rows: { row: number; get: (k: K) => Cell | undefined }[];
}

/** Finds the heading row and returns the data rows, read by column name. */
function readTable<K extends string>(
  sheet: Sheet,
  columns: Record<K, { title: string; aliases: readonly string[] }>,
  required: NoInfer<K>[],
  problems: ImportProblem[],
): Table<K> | null {
  const headerIndex = sheet.rows.findIndex((r) => r.some((c) => str(c) !== ""));
  if (headerIndex < 0) return { name: sheet.name, rows: [] };
  const header = sheet.rows[headerIndex]!.map((c) => headingKey(str(c)));
  const index = {} as Record<K, number>;
  for (const k of Object.keys(columns) as K[]) {
    index[k] = header.findIndex((h) => h !== "" && columns[k].aliases.includes(h));
  }
  const missing = required.filter((k) => index[k] < 0);
  if (missing.length) {
    problems.push({
      sheet: sheet.name,
      row: headerIndex + 1,
      message: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.map((k) => `"${columns[k].title}"`).join(", ")}. Keep the headings from the downloaded sheet.`,
    });
    return null;
  }
  const rows = sheet.rows
    .map((cells, i) => ({
      row: i + 1,
      get: (k: K) => (index[k] >= 0 ? cells[index[k]] : undefined),
      blank: cells.every((c) => str(c) === ""),
    }))
    .filter((r, i) => i > headerIndex && !r.blank)
    .map(({ row, get }) => ({ row, get }));
  return { name: sheet.name, rows };
}

const findSheet = (sheets: Sheet[], name: string) => sheets.find((s) => key(s.name) === key(name));

/** Checks an uploaded workbook and, when `apply` is true and there are no problems, saves it. */
export function importSetupWorkbook(store: Store, bytes: Uint8Array, apply: boolean): ImportResult {
  let sheets: Sheet[];
  try {
    sheets = readXlsx(bytes);
  } catch (err) {
    if (err instanceof XlsxError)
      throw new AppError(`${err.message} Save it from Excel as "Excel Workbook (.xlsx)".`);
    throw err;
  }
  const found = {
    inventory: findSheet(sheets, SHEETS.inventory),
    menu: findSheet(sheets, SHEETS.menu),
    recipes: findSheet(sheets, SHEETS.recipes),
  };
  if (!found.inventory && !found.menu && !found.recipes)
    throw new AppError(
      'No "Inventory", "Menu" or "Recipes" sheet in this file. Download the Kasuri template, fill it in and upload that.',
    );

  return store.trial(
    () => runImport(store, found),
    (result) => apply && result.problems.length === 0,
    (result) => ({ ...result, applied: apply && result.problems.length === 0 }),
  );
}

function runImport(
  store: Store,
  found: { inventory?: Sheet; menu?: Sheet; recipes?: Sheet },
): ImportResult {
  const problems: ImportProblem[] = [];
  const result: ImportResult = {
    applied: false,
    problems,
    inventory: { added: 0, updated: 0, unchanged: 0 },
    menu: { added: 0, updated: 0, unchanged: 0, categoriesAdded: 0 },
    recipes: { dishes: 0, lines: 0 },
  };

  /** Runs one row's changes; on error the row's changes are undone and the problem noted. */
  const row = (sheet: string, rowNumber: number, fn: () => void) => {
    try {
      store.transaction(fn);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      problems.push({ sheet, row: rowNumber, message: err.message });
    }
  };
  const fail = (message: string): never => {
    throw new AppError(message);
  };

  // ----- Inventory -----
  if (found.inventory) {
    const t = readTable(found.inventory, COLUMNS.inventory, ["name", "unit"], problems);
    const seen = new Map<string, number>();
    for (const r of t?.rows ?? []) {
      row(t!.name, r.row, () => {
        const name = str(r.get("name"));
        if (!name) fail("Stock item name is empty");
        if (seen.has(key(name)))
          fail(`${name} is also on row ${seen.get(key(name))}. Keep one row per item.`);
        seen.set(key(name), r.row);

        const rawUnit = str(r.get("unit"));
        const unit = rawUnit ? normalizeUnit(rawUnit) : null;
        if (rawUnit && !unit)
          fail(`Unknown unit "${rawUnit}". Use one of: ${INVENTORY_UNITS.join(", ")}`);
        const stock = num(r.get("stock"));
        if (stock != null && !(stock >= 0)) fail('"Stock now" must be a number, zero or more');
        const warn = num(r.get("warn"));
        if (warn != null && !(warn >= 0)) fail('"Warn below" must be a number, zero or more');

        const existing = store.inventoryItems().find((i) => key(String(i.name)) === key(name)) as
          | {
              id: string;
              name: string;
              unit: string;
              current_quantity: number;
              low_stock_level: number | null;
              is_active: boolean;
            }
          | undefined;
        if (!existing) {
          if (!unit) fail("Unit is empty");
          store.saveInventoryItem(null, {
            name,
            unit: unit!,
            opening_quantity: stock ?? 0,
            low_stock_level: warn,
          });
          result.inventory.added++;
          return;
        }
        const nextUnit = unit ?? existing.unit;
        const changed =
          existing.unit !== nextUnit ||
          (existing.low_stock_level ?? null) !== warn ||
          (stock != null && Number(existing.current_quantity) !== stock);
        if (!changed) {
          result.inventory.unchanged++;
          return;
        }
        store.saveInventoryItem(existing.id, {
          name: existing.name,
          unit: nextUnit,
          is_active: existing.is_active,
          low_stock_level: warn,
        });
        if (stock != null && Number(existing.current_quantity) !== stock)
          store.recordMovement(existing.id, "count", stock, "Excel upload");
        result.inventory.updated++;
      });
    }
  }

  // ----- Menu -----
  if (found.menu) {
    const t = readTable(found.menu, COLUMNS.menu, ["dish", "price"], problems);
    const seen = new Map<string, number>();
    for (const r of t?.rows ?? []) {
      row(t!.name, r.row, () => {
        const name = str(r.get("dish"));
        if (!name) fail("Dish name is empty");
        if (seen.has(key(name)))
          fail(`${name} is also on row ${seen.get(key(name))}. Keep one row per dish.`);
        seen.set(key(name), r.row);

        const existing = (
          store.menuItems(false) as {
            id: string;
            name: string;
            price: number;
            tax_rate: number;
            is_active: boolean;
            category_id: string;
          }[]
        ).find((m) => key(m.name) === key(name));

        let categoryId = existing?.category_id;
        const categoryName = str(r.get("category"));
        if (categoryName) {
          const find = () =>
            (store.categories() as { id: string; name: string }[]).find(
              (c) => key(c.name) === key(categoryName),
            );
          if (!find()) {
            store.addCategory(categoryName);
            result.menu.categoriesAdded++;
          }
          categoryId = find()!.id;
        }
        if (!categoryId) fail("Category is empty");

        const price = num(r.get("price"));
        if (price == null && !existing) fail("Price is empty");
        if (price != null && !(price >= 0)) fail("Price must be a number, zero or more");
        const gst = num(r.get("gst"));
        if (gst != null && !(gst >= 0 && gst <= 100)) fail("GST % must be a number from 0 to 100");
        const available = yes(r.get("available"));
        if (available === "bad") fail('Available must be "Yes" or "No"');

        const next = {
          // Matched ignoring capitals; keep the spelling already in Kasuri.
          name: existing?.name ?? name,
          category_id: categoryId!,
          price: price ?? Number(existing!.price),
          tax_rate: gst ?? (existing ? Number(existing.tax_rate) : 5),
          is_active: (available as boolean | null) ?? existing?.is_active ?? true,
        };
        if (
          existing &&
          existing.name === next.name &&
          existing.category_id === next.category_id &&
          Number(existing.price) === next.price &&
          Number(existing.tax_rate) === next.tax_rate &&
          existing.is_active === next.is_active
        ) {
          result.menu.unchanged++;
          return;
        }
        store.saveMenuItem(existing?.id ?? null, next);
        if (existing) result.menu.updated++;
        else result.menu.added++;
      });
    }
  }

  // ----- Recipes -----
  if (found.recipes) {
    const t = readTable(found.recipes, COLUMNS.recipes, ["dish", "stock", "qty"], problems);
    // Check each row, then save each dish's full recipe at once.
    const byDish = new Map<
      string,
      { dishId: string; firstRow: number; lines: IngredientInput[] }
    >();
    const dishes = store.menuItems(false) as { id: string; name: string }[];
    const stockItems = store.inventoryItems() as unknown as {
      id: string;
      name: string;
      unit: string;
    }[];
    for (const r of t?.rows ?? []) {
      row(t!.name, r.row, () => {
        const dishName = str(r.get("dish"));
        const stockName = str(r.get("stock"));
        if (!dishName) fail("Dish is empty");
        if (!stockName) fail("Stock item is empty");
        const dish = dishes.find((d) => key(d.name) === key(dishName));
        if (!dish) fail(`No dish called "${dishName}". Add it on the Menu sheet first.`);
        const stock = stockItems.find((s) => key(s.name) === key(stockName));
        if (!stock)
          fail(`No stock item called "${stockName}". Add it on the Inventory sheet first.`);
        const qty = num(r.get("qty"));
        if (qty == null || !(qty > 0)) fail("Quantity per portion must be a number above zero");
        const rawUnit = str(r.get("unit"));
        const unit = rawUnit ? normalizeUnit(rawUnit) : stock!.unit;
        if (!unit) fail(`Unknown unit "${rawUnit}". Use one of: ${INVENTORY_UNITS.join(", ")}`);
        if (!compatibleUnits(stock!.unit).includes(unit!))
          fail(
            `${stock!.name} is kept in ${stock!.unit}, so use ${compatibleUnits(stock!.unit).join(" or ")} here, not ${unit}`,
          );
        const entry = byDish.get(dish!.id) ?? { dishId: dish!.id, firstRow: r.row, lines: [] };
        if (entry.lines.some((l) => l.inventory_item_id === stock!.id))
          fail(
            `${stock!.name} is listed twice for ${dish!.name}. Put the total amount on one row.`,
          );
        entry.lines.push({ inventory_item_id: stock!.id, quantity: qty!, unit: unit! });
        byDish.set(dish!.id, entry);
      });
    }
    for (const entry of byDish.values()) {
      row(t!.name, entry.firstRow, () => {
        store.saveMenuItem(entry.dishId, { ingredients: entry.lines });
        result.recipes.dishes++;
        result.recipes.lines += entry.lines.length;
      });
    }
  }

  return result;
}
