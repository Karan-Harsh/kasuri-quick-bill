import { createFileRoute, Outlet } from "@tanstack/react-router";
import { StaffRouteGuard } from "@/components/StaffRouteGuard";

// Login is disabled: every page opens directly.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => (
    <StaffRouteGuard>
      <Outlet />
    </StaffRouteGuard>
  ),
});
