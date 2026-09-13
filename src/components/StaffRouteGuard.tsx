import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useStaff } from "@/hooks/useStaff";

const KITCHEN_ALLOWED = ["/kitchen", "/kot"];

export function StaffRouteGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: staff, isLoading } = useStaff();

  useEffect(() => {
    if (isLoading || staff?.role !== "kitchen") return;
    const allowed = KITCHEN_ALLOWED.some((prefix) => pathname.startsWith(prefix));
    if (!allowed) {
      navigate({ to: "/kitchen", replace: true });
    }
  }, [isLoading, staff?.role, pathname, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  return children;
}
