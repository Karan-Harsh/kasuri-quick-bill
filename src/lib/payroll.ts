import type { Adjustment, AttendanceRecord, Employee, PayrollLine, Settings } from "./staff-types";

export function daysInMonth(month: string): number {
  const [y = 0, m = 0] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthDates(month: string): string[] {
  const n = daysInMonth(month);
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (iso: string) => {
  const [y = 0, m = 0, d = 0] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const addDays = (iso: string, n: number) => {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
};
/** Day `day` of `month` + `offset` months, moved back to the last day if that month is shorter. */
const dayOfMonth = (month: string, offset: number, day: number) => {
  const [y = 0, m = 0] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return toISO(first);
};

/**
 * The pay period shown under `month` (YYYY-MM): the period that ENDS in that month.
 *
 * - calendar: the month itself (1st to last day).
 * - joining:  from the day of the month the person joined. Joined on the 17th → 17 May to 16 June
 *             is June's period (paid on 17 June). Joined on the 1st → the calendar month.
 */
export function payPeriod(
  employee: Pick<Employee, "join_date">,
  month: string,
  settings: Settings,
) {
  const joinDay = Number(employee.join_date.slice(8, 10)) || 1;
  if (settings.pay_cycle !== "joining" || joinDay === 1) {
    const dates = monthDates(month);
    return { start: dates[0]!, end: dates[dates.length - 1]! };
  }
  const start = dayOfMonth(month, -1, joinDay);
  const end = addDays(dayOfMonth(month, 0, joinDay), -1);
  return { start, end };
}

/** Every date from `start` to `end`, inclusive. */
function datesBetween(start: string, end: string) {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calculates one employee's salary for the pay period shown under `month` (see payPeriod).
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
  const period = payPeriod(employee, month, settings);
  const dates = datesBetween(period.start, period.end);
  const periodDays = dates.length;
  const basisDays = settings.per_day_basis === "fixed30" ? 30 : periodDays;
  const perDay = employee.monthly_salary / basisDays;

  // Only days on/after joining are paid.
  const eligibleDates = dates.filter((d) => d >= employee.join_date);
  const eligibleSet = new Set(eligibleDates);
  const eligibleDays = eligibleDates.length;

  const basePay =
    eligibleDays === periodDays
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

  // Allowed leaves are pro-rated (to the nearest half day) for someone who joined part-way through.
  const allowed =
    eligibleDays === periodDays
      ? employee.allowed_leaves
      : Math.round(((employee.allowed_leaves * eligibleDays) / periodDays) * 2) / 2;

  const leavesTaken = absent + half * 0.5;
  const extraLeaves = Math.max(0, leavesTaken - allowed);
  const unusedLeaves = Math.max(0, allowed - leavesTaken);
  const leaveDeduction = Math.min(basePay, extraLeaves * perDay);
  const unusedLeavePay = settings.pay_unused_leaves ? unusedLeaves * perDay : 0;
  const overtimePay = overtimeHours * employee.overtime_rate;

  // Advances, bonuses and deductions dated inside the pay period.
  let bonus = 0;
  let advance = 0;
  let otherDeduction = 0;
  for (const adj of adjustments) {
    if (adj.employee_id !== employee.id || adj.date < period.start || adj.date > period.end)
      continue;
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
    days_in_month: periodDays,
    eligible_days: eligibleDays,
    period_start: period.start,
    period_end: period.end,
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
