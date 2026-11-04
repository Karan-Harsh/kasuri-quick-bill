import { createFileRoute, redirect } from "@tanstack/react-router";

// Login is disabled. Old links to the sign-in page go to the dashboard instead.
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
