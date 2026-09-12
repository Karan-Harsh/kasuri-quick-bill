import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OrganizationSettings {
  id: number;
  name: string;
  gst_enabled: boolean;
}

const defaultSettings: OrganizationSettings = {
  id: 1,
  name: "Kasuri",
  gst_enabled: false,
};

export function useOrganizationSettings() {
  return useQuery<OrganizationSettings>({
    queryKey: ["organization-settings"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_settings")
        .select("id, name, gst_enabled")
        .eq("id", 1)
        .maybeSingle();

      if (error) {
        // Table not migrated yet — fall back so billing still works.
        if (error.code === "42P01" || error.code === "PGRST205") {
          return defaultSettings;
        }
        throw error;
      }

      return data ?? defaultSettings;
    },
  });
}
