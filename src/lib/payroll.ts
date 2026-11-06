import type { Adjustment, AttendanceRecord, Employee, PayrollLine, Settings } from "./staff-types";

export function daysInMonth(month: string): number {
  const [y = 0, m = 0] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthDates(month: string): string[] {
  const n = daysInMonth(month);
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calculates one employee's salary for a month.
 *
 * Days with no attendance record count as present, so the owner only needs
 * to mark exceptions (absent, half day, etc).
 */
export function calculatePayroll(
  employee: Employee,
  month: string,
  attendance: AttendanceRecord[],
  adjustments: Adjustment[],
  settings: Settings,
): PayrollLine {
  const dates = monthDates(month);
  const calendarDays = dates.length;
  const basisDays = settings.per_day_basis === "fixed30" ? 30 : calendarDays;
  const perDay = employee.monthly_salary / basisDays;

  // Only days on/after joining are paid.
  const eligibleDates = dates.filter((d) => d >= employee.join_date);
  const eligibleSet = new Set(eligibleDates);
  const eligibleDays = eligibleDates.length;

  const basePay =
    eligibleDays === calendarDays
      ? employee.monthly_salary
      : perDay * Math.min(eligibleDays, basisDays);

  let absent = 0;
  let half = 0;
  let paidLeave = 0;
  let overtimeHours = 0;
  for (const rec of attendance) {
    if (rec.employee_id !== employee.id || !eligibleSet.has(rec.date)) continue;
    if (rec.status === "A") absent++;
    else if (rec.status === "H") half++;
    else if (rec.status === "L") paidLeave++;
    overtimeHours += rec.overtime_hours || 0;
  }

  // Allowed leaves are pro-rated (to the nearest half day) for someone who joined mid-month.
  const allowed =
    eligibleDays === calendarDays
      ? employee.allowed_leaves
      : Math.round(((employee.allowed_leaves * eligibleDays) / calendarDays) * 2) / 2;

  const leavesTaken = absent + half * 0.5;
  const extraLeaves = Math.max(0, leavesTaken - allowed);
  const unusedLeaves = Math.max(0, allowed - leavesTaken);
  const leaveDeduction = Math.min(basePay, extraLeaves * perDay);
  const unusedLeavePay = settings.pay_unused_leaves ? unusedLeaves * perDay : 0;
  const overtimePay = overtimeHours * employee.overtime_rate;

  let bonus = 0;
  let advance = 0;
  let otherDeduction = 0;
  for (const adj of adjustments) {
    if (adj.employee_id !== employee.id || !adj.date.startsWith(month)) continue;
    if (adj.type === "bonus") bonus += adj.amount;
    else if (adj.type === "advance") advance += adj.amount;
    else otherDeduction += adj.amount;
  }

  const net = Math.round(
    basePay - leaveDeduction + unusedLeavePay + overtimePay + bonus - advance - otherDeduction,
  );

  return {
    employee_id: employee.id,
    name: employee.name,
    role: employee.role,
    month,
    monthly_salary: employee.monthly_salary,
    per_day_rate: round2(perDay),
    days_in_month: calendarDays,
    eligible_days: eligibleDays,
    base_pay: round2(basePay),
    absent_days: absent,
    half_days: half,
    paid_leave_days: paidLeave,
    leaves_taken: leavesTaken,
    allowed_leaves: allowed,
    extra_leaves: extraLeaves,
    unused_leaves: unusedLeaves,
    leave_deduction: round2(leaveDeduction),
    unused_leave_pay: round2(unusedLeavePay),
    overtime_hours: round2(overtimeHours),
    overtime_pay: round2(overtimePay),
    bonus: round2(bonus),
    advance: round2(advance),
    other_deduction: round2(otherDeduction),
    net_pay: net,
  };
}
