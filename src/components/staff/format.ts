// Formatting helpers and salary settings for the staff screens.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "@/lib/staff-api";
import type { Settings } from "@/lib/staff-types";

const DEFAULT_SETTINGS: Settings = {
  restaurant_name: "Kasuri",
  currency_symbol: "₹",
  per_day_basis: "calendar",
  pay_unused_leaves: false,
  pay_cycle: "joining",
};

/** Restaurant name and salary rules (shared cache with Settings → Salary rules). */
export function useSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["staff", "settings"], queryFn: staffApi.settings });
  return {
    settings: data ?? DEFAULT_SETTINGS,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  };
}

export function useMoney() {
  const { settings } = useSettings();
  return (n: number, decimals = false) =>
    `${n < 0 ? "−" : ""}${settings.currency_symbol}${Math.abs(n).toLocaleString("en-IN", {
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    })}`;
}
const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const today = () => toISODate(new Date());
export const thisMonth = () => today().slice(0, 7);

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number, number];
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function shiftDate(date: string, delta: number) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return toISODate(new Date(y, m - 1, d + delta));
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function dateLabel(
  date: string,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", opts);
}

export function weekday(date: string) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getDay();
}

export function fmtNum(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function toCSV(rows: (string | number)[][]) {
  return rows
    .map((r) =>
      r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(","),
    )
    .join("\n");
}

/** "17 May – 16 Jun 2026" for a pay period, or "June 2026" when it is a whole calendar month. */
export function periodLabel(line: {
  month: string;
  period_start?: string;
  period_end?: string;
}): string {
  const { period_start: start, period_end: end } = line;
  if (
    !start ||
    !end ||
    (start.endsWith("-01") && start.slice(0, 7) === line.month && end.slice(0, 7) === line.month)
  )
    return monthLabel(line.month);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${dateLabel(start, sameYear ? { day: "numeric", month: "short" } : undefined)} – ${dateLabel(end)}`;
}

/** The day salary for a period is due: the day after it ends (joined on the 17th → paid on the 17th). */
export function payDueDate(line: { period_end?: string }): string | null {
  if (!line.period_end) return null;
  return shiftDate(line.period_end, 1);
}
