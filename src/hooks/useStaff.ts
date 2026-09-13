import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StaffInfo {
  userId: string | null;
  email: string | null;
  role: "admin" | "cashier" | "kitchen" | null;
}

export function useStaff() {
  return useQuery<StaffInfo>({
    queryKey: ["staff"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return { userId: null, email: null, role: null };

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      let role = roles?.[0]?.role ?? null;
      if (!role) {
        const { data: claimed } = await supabase.rpc("claim_staff_role");
        role = claimed ?? null;
      }
      return { userId: user.id, email: user.email ?? null, role };
    },
  });
}
