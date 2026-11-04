import { useQuery } from "@tanstack/react-query";

export interface StaffInfo {
  userId: string | null;
  email: string | null;
  role: "admin" | "cashier" | "kitchen" | null;
}

export function useStaff() {
  return useQuery<StaffInfo>({
    queryKey: ["staff"],
    staleTime: 60_000,
    // Login is disabled, so whoever uses the app has full (admin) access.
    queryFn: async () => ({ userId: null, email: null, role: "admin" }),
  });
}
