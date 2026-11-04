import { createFileRoute, redirect } from "@tanstack/react-router";

// Login is disabled: open the billing dashboard straight away.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
