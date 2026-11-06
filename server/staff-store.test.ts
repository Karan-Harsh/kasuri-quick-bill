import { beforeEach, describe, expect, test } from "bun:test";
import { openDatabase } from "./db";
import { Store } from "./store";

let store: Store;
beforeEach(() => {
  store = new Store(openDatabase(":memory:", { starterMenu: "demo" }));
});
const staff = () => store.staff;
const ravi = () =>
  staff().createEmployee({
    name: "Ravi",
    role: "Cook",
    monthly_salary: 31000,
    allowed_leaves: 2,
    overtime_rate: 100,
    join_date: "2026-01-01",
  });

describe("staff", () => {
  test("adds, edits and lists staff; checks required fields", () => {
    const r = ravi();
    expect(r).toMatchObject({ id: 1, name: "Ravi", active: 1 });
    staff().updateEmployee(r.id, { ...r, active: 0 });
    expect(staff().employees()[0]).toMatchObject({ active: 0 });
    expect(() => staff().createEmployee({ name: "", join_date: "2026-01-01" })).toThrow("Name");
    expect(() => staff().createEmployee({ name: "X", monthly_salary: 1 })).toThrow("Joining date");
  });

  test("attendance: present is the default and isn't stored", () => {
    const r = ravi();
    staff().saveAttendance([{ employee_id: r.id, date: "2026-01-05", status: "A" }]);
    expect(staff().attendanceForMonth("2026-01")).toHaveLength(1);
    staff().saveAttendance([{ employee_id: r.id, date: "2026-01-05", status: "P" }]);
    expect(staff().attendanceForMonth("2026-01")).toHaveLength(0);
  });

  test("salary uses leaves, overtime and advances; paying saves a snapshot", () => {
    const r = ravi();
    // 3 absences with 2 allowed = 1 extra leave (31000 / 31 = 1000 a day), 2 hours overtime.
    staff().saveAttendance([
      { employee_id: r.id, date: "2026-01-05", status: "A" },
      { employee_id: r.id, date: "2026-01-06", status: "A" },
      { employee_id: r.id, date: "2026-01-07", status: "A", overtime_hours: 2 },
    ]);
    staff().addAdjustment({ employee_id: r.id, type: "advance", amount: 5000, date: "2026-01-10" });
    const [entry] = staff().payroll("2026-01");
    expect(entry!.live).toMatchObject({
      extra_leaves: 1,
      leave_deduction: 1000,
      overtime_pay: 200,
      advance: 5000,
      net_pay: 25200,
    });

    staff().pay({ employee_id: r.id, month: "2026-01", method: "UPI" });
    expect(() => staff().pay({ employee_id: r.id, month: "2026-01" })).toThrow("Already");
    // Later changes don't alter what was paid.
    staff().addAdjustment({ employee_id: r.id, type: "bonus", amount: 500, date: "2026-01-20" });
    const [after] = staff().payroll("2026-01");
    expect(after!.line.net_pay).toBe(25200);
    expect(after!.live.net_pay).toBe(25700);
    expect(after!.payment).toMatchObject({ amount: 25200, method: "UPI" });

    staff().undoPayment(after!.payment!.id);
    expect(staff().payroll("2026-01")[0]!.payment).toBeNull();
  });

  test("salary rules can be changed", () => {
    expect(staff().settings()).toMatchObject({
      per_day_basis: "calendar",
      pay_unused_leaves: false,
    });
    staff().saveSettings({ per_day_basis: "fixed30", pay_unused_leaves: true });
    expect(staff().settings()).toMatchObject({ per_day_basis: "fixed30", pay_unused_leaves: true });
    expect(() => staff().saveSettings({ per_day_basis: "weekly" as never })).toThrow("Invalid");
  });

  test("each person shows from their first full pay period (joining-date cycle)", () => {
    staff().saveSettings({ pay_cycle: "joining" });
    staff().createEmployee({
      name: "Bishnu",
      role: "Head chef",
      monthly_salary: 24000,
      join_date: "2026-05-17",
    });
    staff().createEmployee({
      name: "Rupchand",
      role: "Waiter",
      monthly_salary: 11000,
      join_date: "2026-06-10",
    });
    const names = (month: string) =>
      staff()
        .payroll(month)
        .map((e) => e.line.name);
    expect(names("2026-05")).toEqual([]); // Bishnu's first period ends 16 June
    expect(names("2026-06")).toEqual(["Bishnu"]); // Rupchand's first period ends 9 July
    expect(names("2026-07")).toEqual(["Bishnu", "Rupchand"]);
    const [b] = staff().payroll("2026-06");
    expect(b!.line).toMatchObject({
      period_start: "2026-05-17",
      period_end: "2026-06-16",
      net_pay: 24000,
    });
  });

  test("deleting a person removes their records too", () => {
    const r = ravi();
    staff().saveAttendance([{ employee_id: r.id, date: "2026-01-05", status: "A" }]);
    staff().addAdjustment({ employee_id: r.id, type: "advance", amount: 100, date: "2026-01-10" });
    staff().pay({ employee_id: r.id, month: "2026-01" });
    staff().deleteEmployee(r.id);
    expect(staff().employees()).toEqual([]);
    expect(staff().attendanceForMonth("2026-01")).toEqual([]);
    expect(staff().adjustmentsForMonth("2026-01")).toEqual([]);
  });
});
