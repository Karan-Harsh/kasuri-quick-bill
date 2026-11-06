// Expenses and profit & loss.
//
// Profit for a month = sales (after discount, before GST)
//                    − ingredients bought (amount paid on stock received)
//                    − salaries earned that month
//                    − other expenses (rent, electricity, ...)
// GST is shown but not counted as income: it is collected for the government.
import type { Database } from "bun:sqlite";
import { now, uuid } from "./db";
import { AppError } from "./errors";
import type { StaffStore } from "./staff-store";

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Gas",
  "Water",
  "Repairs",
  "Cleaning",
  "Other",
];

export interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  note: string | null;
  created_at: string;
}

export interface MonthResult {
  month: string; // YYYY-MM
  bills: number;
  /** Sales after discounts, before GST. */
  sales: number;
  gst: number;
  ingredients: number;
  /** Deliveries in the month with no amount paid entered (so ingredient cost may be too low). */
  unpricedDeliveries: number;
  salaries: number;
  /** True for the month still running: salaries assume full attendance for the days left. */
  salariesEstimated: boolean;
  expenses: number;
  expensesByCategory: Record<string, number>;
  profit: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const thisMonth = () => new Date().toLocaleDateString("en-CA").slice(0, 7);

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number) as [number, number];
  const [ty, tm] = to.split("-").map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) [y, m] = [y + 1, 1];
  }
  return out;
}

/** Start of a month in this computer's local time, as an ISO timestamp (bills store UTC times). */
const monthStartIso = (month: string, add = 0) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(y, m - 1 + add, 1).toISOString();
};

export class AccountsStore {
  constructor(
    private db: Database,
    private staff: StaffStore,
  ) {}

  private get<T>(sql: string, params: Record<string, unknown>): T {
    return this.db.query(sql).get(params as never) as T;
  }
  private all<T>(sql: string, params: Record<string, unknown> = {}): T[] {
    return this.db.query(sql).all(params as never) as T[];
  }

  // ---------- expenses ----------

  expenses(fromDate: string, toDate: string): Expense[] {
    if (!isDate(fromDate) || !isDate(toDate)) throw new AppError("Pick dates");
    return this.all<Expense>(
      "SELECT * FROM expenses WHERE date >= $from AND date <= $to ORDER BY date DESC, created_at DESC",
      { from: fromDate, to: toDate },
    );
  }

  /** Categories to suggest: the usual ones plus any typed before. */
  expenseCategories(): string[] {
    const used = this.all<{ category: string }>(
      "SELECT DISTINCT category FROM expenses ORDER BY category",
    ).map((r) => r.category);
    const seen = new Set(DEFAULT_EXPENSE_CATEGORIES.map((c) => c.toLowerCase()));
    return [...DEFAULT_EXPENSE_CATEGORIES, ...used.filter((c) => !seen.has(c.toLowerCase()))];
  }

  addExpense(input: { date?: string; category?: string; amount?: number | string; note?: string }) {
    const date = input?.date;
    if (!isDate(date)) throw new AppError("Pick the date");
    const category = String(input.category ?? "")
      .trim()
      .slice(0, 40);
    if (!category) throw new AppError("Pick or type a category");
    const amount = Number(input.amount);
    if (!(Number.isFinite(amount) && amount > 0)) throw new AppError("Amount must be more than 0");
    // Match an existing category's spelling ("rent" → "Rent").
    const known = this.expenseCategories().find((c) => c.toLowerCase() === category.toLowerCase());
    const id = uuid();
    this.db
      .query(
        "INSERT INTO expenses (id, date, category, amount, note, created_at) VALUES ($id, $date, $cat, $amount, $note, $at)",
      )
      .run({
        id,
        date,
        cat: known ?? category,
        amount: round2(amount),
        note:
          String(input.note ?? "")
            .trim()
            .slice(0, 200) || null,
        at: now(),
      } as never);
    return { id };
  }

  deleteExpense(id: string) {
    const r = this.db.query("DELETE FROM expenses WHERE id = $id").run({ id } as never);
    if (r.changes === 0) throw new AppError("Expense not found", 404);
  }

  // ---------- profit & loss ----------

  /** Profit and loss for each month from `fromMonth` to `toMonth` (YYYY-MM), plus totals. */
  profitAndLoss(fromMonth: string, toMonth: string) {
    if (!isMonth(fromMonth) || !isMonth(toMonth)) throw new AppError("Pick the months");
    if (fromMonth > toMonth) throw new AppError("The start month is after the end month");
    const months = monthsBetween(fromMonth, toMonth);
    if (months.length > 36) throw new AppError("Pick at most 3 years at a time");
    const current = thisMonth();

    const rows: MonthResult[] = months.map((month) => {
      const range = { start: monthStartIso(month), end: monthStartIso(month, 1) };
      const sales = this.get<{ bills: number; sales: number | null; gst: number | null }>(
        `SELECT COUNT(*) AS bills, SUM(subtotal - discount) AS sales, SUM(tax_amount) AS gst
         FROM orders WHERE status = 'COMPLETED' AND completed_at >= $start AND completed_at < $end`,
        range,
      );
      // Deliveries only: stock put back by a cancelled bill is also "received", but has a bill attached.
      const stock = this.get<{ paid: number | null; unpriced: number }>(
        `SELECT SUM(cost) AS paid, SUM(CASE WHEN cost IS NULL THEN 1 ELSE 0 END) AS unpriced
         FROM inventory_movements
         WHERE movement_type = 'received' AND order_id IS NULL
           AND created_at >= $start AND created_at < $end`,
        range,
      );
      const expenseRows = this.all<{ category: string; total: number }>(
        "SELECT category, SUM(amount) AS total FROM expenses WHERE date LIKE $m || '-%' GROUP BY category ORDER BY total DESC",
        { m: month },
      );
      // Salary earned = what each person is owed for the month before advances are taken off
      // (an advance is early payment of that salary, not an extra cost).
      const salaries =
        month > current
          ? 0
          : this.staff.payroll(month).reduce((sum, e) => sum + e.line.net_pay + e.line.advance, 0);

      const expensesByCategory = Object.fromEntries(
        expenseRows.map((r) => [r.category, round2(r.total)]),
      );
      const expenses = round2(expenseRows.reduce((s, r) => s + r.total, 0));
      const result: Omit<MonthResult, "profit"> = {
        month,
        bills: sales.bills,
        sales: round2(sales.sales ?? 0),
        gst: round2(sales.gst ?? 0),
        ingredients: round2(stock.paid ?? 0),
        unpricedDeliveries: stock.unpriced ?? 0,
        salaries: round2(salaries),
        salariesEstimated: month === current,
        expenses,
        expensesByCategory,
      };
      return {
        ...result,
        profit: round2(result.sales - result.ingredients - result.salaries - result.expenses),
      };
    });

    const total = rows.reduce(
      (t, r) => {
        for (const [c, v] of Object.entries(r.expensesByCategory))
          t.expensesByCategory[c] = round2((t.expensesByCategory[c] ?? 0) + v);
        return {
          ...t,
          bills: t.bills + r.bills,
          sales: round2(t.sales + r.sales),
          gst: round2(t.gst + r.gst),
          ingredients: round2(t.ingredients + r.ingredients),
          unpricedDeliveries: t.unpricedDeliveries + r.unpricedDeliveries,
          salaries: round2(t.salaries + r.salaries),
          salariesEstimated: t.salariesEstimated || r.salariesEstimated,
          expenses: round2(t.expenses + r.expenses),
          profit: round2(t.profit + r.profit),
        };
      },
      {
        bills: 0,
        sales: 0,
        gst: 0,
        ingredients: 0,
        unpricedDeliveries: 0,
        salaries: 0,
        salariesEstimated: false,
        expenses: 0,
        expensesByCategory: {} as Record<string, number>,
        profit: 0,
      },
    );
    return { months: rows, total };
  }
}
