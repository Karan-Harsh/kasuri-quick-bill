// Staff, attendance and salary rules (merged in from the Kasuri Staff & Salary app).
// The salary calculation itself is in src/lib/payroll.ts, shared with the screens.
import type { Database } from "bun:sqlite";
import { calculatePayroll, monthDates, payPeriod } from "../src/lib/payroll";
import type {
  Adjustment,
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  Payment,
  PayrollLine,
  Settings,
} from "../src/lib/staff-types";
import { AppError } from "./errors";

export interface PayrollEntry {
  /** What the slip shows: the saved snapshot once paid, otherwise the live calculation. */
  line: PayrollLine;
  /** Calculated from today's data (differs from `line` if something changed after paying). */
  live: PayrollLine;
  payment: Payment | null;
}

/** Salary rules, kept in app_settings under these keys. */
const SALARY_KEYS = {
  per_day_basis: "salary_per_day_basis",
  pay_unused_leaves: "salary_pay_unused_leaves",
  pay_cycle: "salary_pay_cycle",
} as const;

const STATUSES: AttendanceStatus[] = ["P", "A", "H", "L", "O"];
const ADJUSTMENT_TYPES = ["advance", "bonus", "deduction"];

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const localToday = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

function num(v: unknown, field: string, { min = 0 } = {}): number {
  const n = Number(v);
  if (v === "" || v === null || v === undefined || !Number.isFinite(n) || n < min)
    throw new AppError(`${field} must be a number of at least ${min}`);
  return n;
}

function previousMonth(month: string) {
  const [y = 0, m = 0] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthOrThrow(month: unknown): string {
  if (!isMonth(month)) throw new AppError("Pick a month");
  return month;
}

type Params = (string | number | null)[];

export class StaffStore {
  constructor(private db: Database) {}

  private all<T>(sql: string, ...params: Params): T[] {
    return this.db.query(sql).all(...(params as never[])) as T[];
  }
  private get<T>(sql: string, ...params: Params): T | null {
    return (this.db.query(sql).get(...(params as never[])) as T) ?? null;
  }
  private run(sql: string, ...params: Params) {
    return this.db.query(sql).run(...(params as never[]));
  }
  private tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ---------- settings ----------

  settings(): Settings {
    const name = this.get<{ name: string }>("SELECT name FROM organization_settings WHERE id = 1");
    const read = (key: string) => {
      const row = this.get<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", key);
      return row ? JSON.parse(row.value) : undefined;
    };
    return {
      restaurant_name: name?.name ?? "Kasuri",
      currency_symbol: "₹",
      per_day_basis: read(SALARY_KEYS.per_day_basis) === "fixed30" ? "fixed30" : "calendar",
      pay_unused_leaves: read(SALARY_KEYS.pay_unused_leaves) === true,
      // Kasuri pays each person a month after the day they joined (17th to 17th).
      pay_cycle: read(SALARY_KEYS.pay_cycle) === "calendar" ? "calendar" : "joining",
    };
  }

  saveSettings(
    patch: Partial<Pick<Settings, "per_day_basis" | "pay_unused_leaves" | "pay_cycle">>,
  ) {
    const save = (key: string, value: unknown) =>
      this.run(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        key,
        JSON.stringify(value),
      );
    if (patch.per_day_basis !== undefined) {
      if (patch.per_day_basis !== "calendar" && patch.per_day_basis !== "fixed30")
        throw new AppError("Invalid per-day basis");
      save(SALARY_KEYS.per_day_basis, patch.per_day_basis);
    }
    if (patch.pay_unused_leaves !== undefined)
      save(SALARY_KEYS.pay_unused_leaves, patch.pay_unused_leaves === true);
    if (patch.pay_cycle !== undefined) {
      if (patch.pay_cycle !== "joining" && patch.pay_cycle !== "calendar")
        throw new AppError("Invalid pay cycle");
      save(SALARY_KEYS.pay_cycle, patch.pay_cycle);
    }
    return this.settings();
  }

  // ---------- employees ----------

  employees() {
    return this.all<Employee>("SELECT * FROM employees ORDER BY active DESC, name COLLATE NOCASE");
  }

  employee(id: number) {
    const e = this.get<Employee>("SELECT * FROM employees WHERE id = ?", id);
    if (!e) throw new AppError("Staff member not found", 404);
    return e;
  }

  private employeeValues(body: Partial<Employee>): Params {
    const name = str(body?.name);
    if (!name) throw new AppError("Name is required");
    if (!isDate(body.join_date)) throw new AppError("Joining date is required");
    return [
      name,
      str(body.phone),
      str(body.role),
      num(body.monthly_salary, "Monthly salary"),
      num(body.allowed_leaves ?? 0, "Allowed leaves"),
      num(body.overtime_rate ?? 0, "Overtime rate"),
      body.join_date,
      body.active === 0 || (body.active as unknown) === false ? 0 : 1,
      str(body.notes),
    ];
  }

  createEmployee(body: Partial<Employee>) {
    const r = this.run(
      `INSERT INTO employees (name, phone, role, monthly_salary, allowed_leaves, overtime_rate, join_date, active, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...this.employeeValues(body),
    );
    return this.employee(Number(r.lastInsertRowid));
  }

  updateEmployee(id: number, body: Partial<Employee>) {
    this.employee(id);
    this.run(
      `UPDATE employees SET name=?, phone=?, role=?, monthly_salary=?, allowed_leaves=?, overtime_rate=?,
         join_date=?, active=?, notes=? WHERE id=?`,
      ...this.employeeValues(body),
      id,
    );
    return this.employee(id);
  }

  /** Deletes a person and all their attendance, advances and salary records. */
  deleteEmployee(id: number) {
    this.run("DELETE FROM employees WHERE id = ?", id); // the rest cascades
  }

  // ---------- attendance ----------

  attendanceForMonth(month: string) {
    return this.all<AttendanceRecord>(
      "SELECT * FROM attendance WHERE date LIKE ? || '-%'",
      monthOrThrow(month),
    );
  }

  attendanceForDate(date: string) {
    if (!isDate(date)) throw new AppError("Pick a date");
    return this.all<AttendanceRecord>("SELECT * FROM attendance WHERE date = ?", date);
  }

  /** Saves attendance. A plain "present" with no times, overtime or note is removed, since present is the default. */
  saveAttendance(records: Partial<AttendanceRecord>[]) {
    if (!Array.isArray(records)) throw new AppError("Nothing to save");
    this.tx(() => {
      for (const r of records) {
        if (!isDate(r.date)) throw new AppError("Invalid date");
        if (!r.status || !STATUSES.includes(r.status)) throw new AppError("Invalid status");
        const employeeId = num(r.employee_id, "Staff member", { min: 1 });
        const checkIn = str(r.check_in) || null;
        const checkOut = str(r.check_out) || null;
        const ot = num(r.overtime_hours ?? 0, "Overtime hours");
        const note = str(r.note);
        if (r.status === "P" && !checkIn && !checkOut && !ot && !note) {
          this.run("DELETE FROM attendance WHERE employee_id = ? AND date = ?", employeeId, r.date);
        } else {
          this.run(
            `INSERT INTO attendance (employee_id, date, status, check_in, check_out, overtime_hours, note)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(employee_id, date) DO UPDATE SET status=excluded.status, check_in=excluded.check_in,
               check_out=excluded.check_out, overtime_hours=excluded.overtime_hours, note=excluded.note`,
            employeeId,
            r.date,
            r.status,
            checkIn,
            checkOut,
            ot,
            note,
          );
        }
      }
    });
  }

  // ---------- advances, bonuses, deductions ----------

  adjustmentsForMonth(month: string) {
    return this.all<Adjustment>(
      "SELECT * FROM salary_adjustments WHERE date LIKE ? || '-%' ORDER BY date DESC, id DESC",
      monthOrThrow(month),
    );
  }

  adjustmentsForEmployee(id: number) {
    return this.all<Adjustment>(
      "SELECT * FROM salary_adjustments WHERE employee_id = ? ORDER BY date DESC, id DESC",
      id,
    );
  }

  addAdjustment(a: Partial<Adjustment>) {
    if (!a?.type || !ADJUSTMENT_TYPES.includes(a.type)) throw new AppError("Invalid type");
    if (!isDate(a.date)) throw new AppError("Date is required");
    const amount = num(a.amount, "Amount");
    if (amount === 0) throw new AppError("Amount must be more than 0");
    const employeeId = num(a.employee_id, "Staff member", { min: 1 });
    this.employee(employeeId);
    this.run(
      "INSERT INTO salary_adjustments (employee_id, type, amount, date, note) VALUES (?, ?, ?, ?, ?)",
      employeeId,
      a.type,
      amount,
      a.date,
      str(a.note),
    );
  }

  deleteAdjustment(id: number) {
    this.run("DELETE FROM salary_adjustments WHERE id = ?", id);
  }

  // ---------- salary ----------

  private parsePayment(row: Payment & { snapshot: unknown }): Payment {
    return {
      ...row,
      snapshot: typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot,
    };
  }

  payroll(month: string): PayrollEntry[] {
    const dates = monthDates(monthOrThrow(month));
    const last = dates[dates.length - 1]!;
    // A pay period can start in the month before (joined on the 17th: 17 May – 16 June).
    const first = monthDates(previousMonth(month))[0]!;
    const settings = this.settings();
    const employees = this.all<Employee>(
      "SELECT * FROM employees WHERE join_date <= ? ORDER BY name COLLATE NOCASE",
      last,
    );
    const attendance = this.all<AttendanceRecord>(
      "SELECT * FROM attendance WHERE date BETWEEN ? AND ?",
      first,
      last,
    );
    const adjustments = this.all<Adjustment>(
      "SELECT * FROM salary_adjustments WHERE date BETWEEN ? AND ?",
      first,
      last,
    );
    const paidBy = new Map(
      this.all<Payment>("SELECT * FROM salary_payments WHERE month = ?", month).map((p) => [
        p.employee_id,
        this.parsePayment(p),
      ]),
    );

    // Former staff are only shown if they have something recorded for this month.
    const relevant = employees.filter(
      (e) =>
        e.active ||
        paidBy.has(e.id) ||
        attendance.some((a) => a.employee_id === e.id) ||
        adjustments.some((a) => a.employee_id === e.id),
    );

    return relevant.flatMap((e) => {
      const payment = paidBy.get(e.id) ?? null;
      // Not working here yet in this period (e.g. joined on 10 June: June's period is 10 May – 9 June).
      if (!payment && payPeriod(e, month, settings).end < e.join_date) return [];
      const live = calculatePayroll(e, month, attendance, adjustments, settings);
      return [{ line: payment ? payment.snapshot : live, live, payment }];
    });
  }

  pay(p: {
    employee_id: number;
    month: string;
    amount?: number;
    paid_on?: string;
    method?: string;
    note?: string;
  }) {
    return this.tx(() => {
      const entry = this.payroll(p?.month).find(
        (e) => e.line.employee_id === Number(p.employee_id),
      );
      if (!entry) throw new AppError("This person is not on the salary list for this month");
      if (entry.payment) throw new AppError("Already marked as paid");
      this.run(
        "INSERT INTO salary_payments (employee_id, month, amount, paid_on, method, note, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?)",
        entry.live.employee_id,
        p.month,
        p.amount === undefined || p.amount === null ? entry.live.net_pay : num(p.amount, "Amount"),
        isDate(p.paid_on) ? p.paid_on : localToday(),
        str(p.method) || "Cash",
        str(p.note),
        JSON.stringify(entry.live),
      );
    });
  }

  undoPayment(id: number) {
    this.run("DELETE FROM salary_payments WHERE id = ?", id);
  }

  paymentsForEmployee(id: number) {
    return this.all<Payment>(
      "SELECT * FROM salary_payments WHERE employee_id = ? ORDER BY month DESC",
      id,
    ).map((p) => this.parsePayment(p));
  }
}
