import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { CalendarCheck, CalendarDays, HandCoins, Users, Wallet } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import DialogHost from "@/components/staff/DialogHost";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff — Kasuri" }] }),
  component: StaffLayout,
});

const TABS = [
  { to: "/staff", label: "Attendance", icon: CalendarCheck, exact: true },
  { to: "/staff/timesheet", label: "Timesheet", icon: CalendarDays },
  { to: "/staff/salary", label: "Salary", icon: Wallet },
  { to: "/staff/advances", label: "Advances", icon: HandCoins },
  { to: "/staff/people", label: "Staff list", icon: Users },
] as const;

/** Staff, attendance and salary (merged in from the Kasuri Staff & Salary app). Counter only. */
function StaffLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <DialogHost />
      <nav className="no-print border-b border-border bg-card/60">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-1 px-4 py-2">
          {TABS.map(({ to, label, icon: Icon, ...rest }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: "exact" in rest }}
              className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              activeProps={{ className: "bg-accent text-foreground" }}
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </div>
      </nav>
      <main className="staff-screen mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
