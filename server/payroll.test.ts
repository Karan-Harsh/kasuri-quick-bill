import { describe, expect, it } from "bun:test";
import { calculatePayroll, daysInMonth } from "../src/lib/payroll";
import type {
  Adjustment,
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  Settings,
} from "../src/lib/staff-types";

const settings: Settings = {
  restaurant_name: "Test",
  currency_symbol: "₹",
  per_day_basis: "calendar",
  pay_unused_leaves: false,
};

const emp: Employee = {
  id: 1,
  name: "Ravi",
  phone: "",
  role: "Cook",
  monthly_salary: 30000,
  allowed_leaves: 2,
  overtime_rate: 100,
  join_date: "2024-01-01",
  active: 1,
  notes: "",
};

const att = (date: string, status: AttendanceStatus, overtime_hours = 0): AttendanceRecord => ({
  employee_id: 1,
  date,
  status,
  check_in: null,
  check_out: null,
  overtime_hours,
  note: "",
});

const adj = (type: Adjustment["type"], amount: number, date: string): Adjustment => ({
  id: 0,
  employee_id: 1,
  type,
  amount,
  date,
  note: "",
});

describe("daysInMonth", () => {
  it("handles leap years", () => {
    expect(daysInMonth("2024-02")).toBe(29);
    expect(daysInMonth("2025-02")).toBe(28);
    expect(daysInMonth("2025-11")).toBe(30);
  });
});

describe("calculatePayroll", () => {
  it("pays full salary with no attendance marked", () => {
    const r = calculatePayroll(emp, "2025-11", [], [], settings);
    expect(r.net_pay).toBe(30000);
    expect(r.leave_deduction).toBe(0);
  });

  it("pays the same fixed salary for a full month, whatever its length", () => {
    const tenK = { ...emp, monthly_salary: 10000 };
    for (const basis of ["calendar", "fixed30"] as const) {
      for (const month of ["2025-02", "2024-02", "2025-11", "2025-10"]) {
        const r = calculatePayroll(tenK, month, [], [], { ...settings, per_day_basis: basis });
        expect(r.base_pay).toBe(10000);
        expect(r.net_pay).toBe(10000);
      }
    }
  });

  it("does not deduct for leaves within the allowance", () => {
    const r = calculatePayroll(
      emp,
      "2025-11",
      [att("2025-11-03", "A"), att("2025-11-04", "A")],
      [],
      settings,
    );
    expect(r.leaves_taken).toBe(2);
    expect(r.extra_leaves).toBe(0);
    expect(r.net_pay).toBe(30000);
  });

  it("deducts one day per extra leave using calendar days", () => {
    // November has 30 days -> 1000/day. 4 absents, 2 allowed -> 2 extra.
    const records = ["03", "04", "05", "06"].map((d) => att(`2025-11-${d}`, "A"));
    const r = calculatePayroll(emp, "2025-11", records, [], settings);
    expect(r.extra_leaves).toBe(2);
    expect(r.leave_deduction).toBe(2000);
    expect(r.net_pay).toBe(28000);
  });

  it("counts half days as half a leave", () => {
    const records = [att("2025-11-03", "A"), att("2025-11-04", "A"), att("2025-11-05", "H")];
    const r = calculatePayroll(emp, "2025-11", records, [], settings);
    expect(r.leaves_taken).toBe(2.5);
    expect(r.leave_deduction).toBe(500);
  });

  it("never deducts paid leave or week offs", () => {
    const records = [att("2025-11-03", "L"), att("2025-11-04", "O"), att("2025-11-05", "L")];
    const r = calculatePayroll(emp, "2025-11", records, [], settings);
    expect(r.net_pay).toBe(30000);
    expect(r.paid_leave_days).toBe(2);
  });

  it("supports the fixed 30-day basis", () => {
    // 31-day month, 3 extra leaves at 30000/30 = 1000
    const records = ["01", "02", "03", "04", "05"].map((d) => att(`2025-10-${d}`, "A"));
    const r = calculatePayroll(emp, "2025-10", records, [], {
      ...settings,
      per_day_basis: "fixed30",
    });
    expect(r.per_day_rate).toBe(1000);
    expect(r.net_pay).toBe(27000);
  });

  it("applies overtime, bonus, advance and other deductions", () => {
    const records = [att("2025-11-10", "P", 3)];
    const adjustments = [
      adj("bonus", 1000, "2025-11-15"),
      adj("advance", 5000, "2025-11-05"),
      adj("deduction", 200, "2025-11-20"),
      adj("advance", 9999, "2025-12-01"), // other month, ignored
    ];
    const r = calculatePayroll(emp, "2025-11", records, adjustments, settings);
    expect(r.overtime_pay).toBe(300);
    expect(r.net_pay).toBe(30000 + 300 + 1000 - 5000 - 200);
  });

  it("pro-rates salary and allowance for mid-month joiners", () => {
    // Joins Nov 16 -> 15 of 30 days, allowance 1
    const joiner = { ...emp, join_date: "2025-11-16" };
    const records = [att("2025-11-10", "A"), att("2025-11-20", "A"), att("2025-11-21", "A")];
    const r = calculatePayroll(joiner, "2025-11", records, [], settings);
    expect(r.eligible_days).toBe(15);
    expect(r.base_pay).toBe(15000);
    expect(r.allowed_leaves).toBe(1);
    expect(r.absent_days).toBe(2); // the absence before joining is ignored
    expect(r.net_pay).toBe(14000);
  });

  it("pays for unused leaves when enabled", () => {
    const r = calculatePayroll(emp, "2025-11", [], [], { ...settings, pay_unused_leaves: true });
    expect(r.unused_leaves).toBe(2);
    expect(r.net_pay).toBe(32000);
  });
});
