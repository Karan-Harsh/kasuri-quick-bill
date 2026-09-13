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
