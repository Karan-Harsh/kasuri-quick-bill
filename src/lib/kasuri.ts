export type OrderType = "DINE_IN" | "PARCEL";
export type PaymentMethod = "CASH" | "UPI" | "CARD";
export type OrderStatus = "OPEN" | "COMPLETED" | "CANCELLED";

export const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "UPI", "CARD"];

export interface BillLine {
  unit_price: number;
  tax_rate: number;
  quantity: number;
}

export interface BillTotals {
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  itemCount: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Prices are tax-exclusive. A discount reduces the taxable value
 * proportionally across all lines.
 */
export function computeTotals(lines: BillLine[], discountInput = 0): BillTotals {
  const subtotal = round2(
    lines.reduce((sum, line) => sum + Number(line.unit_price) * line.quantity, 0),
  );
  const rawTax = lines.reduce(
    (sum, line) =>
      sum + (Number(line.unit_price) * line.quantity * Number(line.tax_rate)) / 100,
    0,
  );
  const discount = round2(Math.min(Math.max(discountInput || 0, 0), subtotal));
  const factor = subtotal > 0 ? (subtotal - discount) / subtotal : 0;
  const taxAmount = round2(rawTax * factor);
  const total = round2(subtotal - discount + taxAmount);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  return { subtotal, discount, taxAmount, total, itemCount };
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const inr = (value: number) => `₹${inrFormatter.format(Number(value) || 0)}`;

export const paymentLabel = (method: PaymentMethod | string | null) => {
  switch (method) {
    case "CASH":
      return "Cash";
    case "UPI":
      return "UPI";
    case "CARD":
      return "Card";
    default:
      return "—";
  }
};

export const orderTypeLabel = (type: OrderType | string) =>
  type === "PARCEL" ? "Parcel" : "Dine-in";
