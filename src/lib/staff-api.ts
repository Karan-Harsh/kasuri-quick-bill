// Staff, attendance and salary data, from the local server (counter only).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { api } from "@/lib/api";
import type {
  Adjustment,
  AttendanceRecord,
  Employee,
  Payment,
  PayrollLine,
  Settings,
} from "@/lib/staff-types";

export interface PayrollEntry {
  line: PayrollLine;
  live: PayrollLine;
  payment: Payment | null;
}

const q = (params: Record<string, string | number>) =>
  "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

export const staffApi = {
  settings: () => api.get<Settings>("/staff/settings"),
  saveSettings: (patch: Partial<Settings>) => api.put<Settings>("/staff/settings", patch),

  employees: () => api.get<Employee[]>("/staff/employees"),
  employee: (id: number) => api.get<Employee>(`/staff/employees/${id}`),
  createEmployee: (e: Partial<Employee>) => api.post<Employee>("/staff/employees", e),
  updateEmployee: (id: number, e: Partial<Employee>) =>
    api.put<Employee>(`/staff/employees/${id}`, e),
  deleteEmployee: (id: number) => api.del(`/staff/employees/${id}`),

  attendanceForMonth: (month: string) =>
    api.get<AttendanceRecord[]>(`/staff/attendance${q({ month })}`),
  attendanceForDate: (date: string) =>
    api.get<AttendanceRecord[]>(`/staff/attendance${q({ date })}`),
  saveAttendance: (records: Partial<AttendanceRecord>[]) =>
    api.put("/staff/attendance", { records }),

  adjustmentsForMonth: (month: string) =>
    api.get<Adjustment[]>(`/staff/adjustments${q({ month })}`),
  adjustmentsForEmployee: (id: number) =>
    api.get<Adjustment[]>(`/staff/adjustments${q({ employee: id })}`),
  addAdjustment: (a: Partial<Adjustment>) => api.post("/staff/adjustments", a),
  deleteAdjustment: (id: number) => api.del(`/staff/adjustments/${id}`),

  payroll: (month: string) => api.get<PayrollEntry[]>(`/staff/payroll${q({ month })}`),
  pay: (p: {
    employee_id: number;
    month: string;
    amount?: number;
    paid_on?: string;
    method?: string;
    note?: string;
  }) => api.post("/staff/payments", p),
  undoPayment: (id: number) => api.del(`/staff/payments/${id}`),
  paymentsForEmployee: (id: number) => api.get<Payment[]>(`/staff/employees/${id}/payments`),
};

/**
 * Loads data for a staff screen: { data, error, loading, reload, setData }.
 * Cached under "staff", so any staff change (from any screen) refreshes it automatically.
 */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const queryClient = useQueryClient();
  const queryKey = ["staff", "screen", useId(), ...deps];
  const query = useQuery({ queryKey, queryFn: loader });
  return {
    data: query.data ?? null,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : String(query.error)
      : null,
    loading: query.isLoading,
    reload: () => query.refetch(),
    setData: (value: T) => queryClient.setQueryData(queryKey, value),
  };
}
