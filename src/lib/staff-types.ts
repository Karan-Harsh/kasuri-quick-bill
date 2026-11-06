// Staff, attendance and salary types (merged in from the Kasuri Staff & Salary app).
export type AttendanceStatus = "P" | "A" | "H" | "L" | "O";
// P = present, A = absent (counts as leave), H = half day (half a leave),
// L = paid leave (approved, never deducted), O = week off / restaurant closed (never deducted)

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  P: "Present",
  A: "Absent",
  H: "Half day",
  L: "Paid leave",
  O: "Week off",
};

export interface Employee {
  id: number;
  name: string;
  phone: string;
  role: string;
  monthly_salary: number;
  allowed_leaves: number;
  overtime_rate: number; // per hour, 0 = no overtime pay
  join_date: string; // YYYY-MM-DD
  active: number; // 1 | 0
  notes: string;
}

export interface AttendanceRecord {
  employee_id: number;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  check_in: string | null; // HH:MM
  check_out: string | null;
  overtime_hours: number;
  note: string;
}

export type AdjustmentType = "advance" | "bonus" | "deduction";

export interface Adjustment {
  id: number;
  employee_id: number;
  type: AdjustmentType;
  amount: number;
  date: string;
  note: string;
}

export interface Settings {
  restaurant_name: string;
  currency_symbol: string;
  /** 'calendar' = salary / days in that month, 'fixed30' = salary / 30 */
  per_day_basis: "calendar" | "fixed30";
  /** pay extra for each allowed leave not taken */
  pay_unused_leaves: boolean;
  /**
   * 'joining' = each person's pay period runs from the day of the month they joined
   * (joined on the 17th: 17th to 16th, paid on the 17th); 'calendar' = 1st to last day of the month.
   */
  pay_cycle: "joining" | "calendar";
}

export interface PayrollLine {
  employee_id: number;
  name: string;
  role: string;
  month: string;
  monthly_salary: number;
  per_day_rate: number;
  /** Days in the pay period (the whole calendar month when paid by calendar month). */
  days_in_month: number;
  eligible_days: number;
  /** First and last day of the pay period (YYYY-MM-DD). Missing on payments saved before pay periods. */
  period_start?: string;
  period_end?: string;
  base_pay: number;
  absent_days: number;
  half_days: number;
  paid_leave_days: number;
  leaves_taken: number;
  allowed_leaves: number;
  extra_leaves: number;
  unused_leaves: number;
  leave_deduction: number;
  unused_leave_pay: number;
  overtime_hours: number;
  overtime_pay: number;
  bonus: number;
  advance: number;
  other_deduction: number;
  net_pay: number;
}

export interface Payment {
  id: number;
  employee_id: number;
  month: string;
  amount: number;
  paid_on: string;
  method: string;
  note: string;
  snapshot: PayrollLine;
}
