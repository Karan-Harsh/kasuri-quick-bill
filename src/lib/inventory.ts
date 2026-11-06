export type InventoryMovementType = "used" | "received" | "count";

export const INVENTORY_UNITS = ["kg", "g", "L", "ml", "pcs", "dozen"] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

export function formatQuantity(value: number, unit: string) {
  const qty = Number(value) || 0;
  const formatted = Number.isInteger(qty) ? String(qty) : qty.toFixed(3).replace(/\.?0+$/, "");
  return `${formatted} ${unit}`;
}

export function movementLabel(type: InventoryMovementType) {
  switch (type) {
    case "used":
      return "Used";
    case "received":
      return "Received";
    case "count":
      return "Stock count";
  }
}

export function movementHint(type: InventoryMovementType) {
  switch (type) {
    case "used":
      return "How much was used today?";
    case "received":
      return "How much was purchased or delivered?";
    case "count":
      return "What quantity is left after counting?";
  }
}

// Units that can be converted into each other, with their size in the group's smallest unit.
const UNIT_GROUPS: Record<string, Record<string, number>>[] = [
  { weight: { g: 1, kg: 1000 } },
  { volume: { ml: 1, L: 1000 } },
  { count: { pcs: 1, dozen: 12 } },
];

const groupOf = (unit: string) =>
  UNIT_GROUPS.map((g) => Object.values(g)[0]!).find((sizes) => unit in sizes);

/** Units a recipe may use for a stock item kept in `stockUnit` (e.g. kg → g, kg). */
export function compatibleUnits(stockUnit: string): string[] {
  const sizes = groupOf(stockUnit);
  return sizes ? Object.keys(sizes) : [stockUnit];
}

/** Converts an amount between units of the same kind (40 g → 0.04 kg). Null if they don't match. */
export function convertQuantity(quantity: number, from: string, to: string): number | null {
  if (from === to) return quantity;
  const sizes = groupOf(from);
  if (!sizes || !(to in sizes)) return null;
  return (quantity * sizes[from]!) / sizes[to]!;
}

/** Stock is low when a minimum level is set and the current quantity has gone below it.
 *  An item whose stock was never entered (tracked = false) isn't low, just not counted yet. */
export function isLowStock(item: {
  current_quantity: number;
  low_stock_level: number | null;
  tracked?: boolean;
}) {
  if (item.tracked === false) return false;
  return (
    item.low_stock_level != null && Number(item.current_quantity) < Number(item.low_stock_level)
  );
}

const UNIT_ALIASES: Record<string, InventoryUnit> = {
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
  g: "g",
  gm: "g",
  gms: "g",
  gram: "g",
  grams: "g",
  gr: "g",
  l: "L",
  ltr: "L",
  ltrs: "L",
  litre: "L",
  litres: "L",
  liter: "L",
  liters: "L",
  ml: "ml",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  pcs: "pcs",
  pc: "pcs",
  piece: "pcs",
  pieces: "pcs",
  nos: "pcs",
  no: "pcs",
  dozen: "dozen",
  dz: "dozen",
  doz: "dozen",
};

/** Turns how people write a unit ("KG", "grams", "litre", "pieces") into the app's unit, or null. */
export function normalizeUnit(raw: string): InventoryUnit | null {
  return UNIT_ALIASES[raw.trim().toLowerCase().replace(/\.$/, "")] ?? null;
}
