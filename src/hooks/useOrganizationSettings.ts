import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface OrganizationSettings {
  id: number;
  name: string;
  gst_enabled: boolean;
}

export function useOrganizationSettings() {
  return useQuery<OrganizationSettings>({
    queryKey: ["organization-settings"],
    staleTime: 30_000,
    queryFn: () => api.get<OrganizationSettings>("/settings"),
  });
}
