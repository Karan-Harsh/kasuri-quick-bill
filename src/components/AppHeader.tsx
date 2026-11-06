import { Link } from "@tanstack/react-router";
import { BarChart3, BookOpen, ChefHat, LayoutGrid, Package, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLowStockItems } from "@/lib/low-stock";

const NAV = [
  { to: "/dashboard", label: "Tables", icon: LayoutGrid },
  { to: "/menu", label: "Menu", icon: BookOpen },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/kitchen", label: "Kitchen", icon: ChefHat },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/staff", label: "Staff", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppHeader() {
  const lowStock = useLowStockItems().length;
  return (
    <header className="no-print sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <Link to="/dashboard" className="mr-2 text-2xl font-extrabold tracking-tight">
          Kasuri
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Button key={to} asChild variant="ghost" className="h-11 text-base">
              <Link to={to} activeProps={{ className: "bg-accent" }}>
                <Icon className="mr-2 size-5" /> {label}
                {to === "/inventory" && lowStock > 0 && (
                  <span
                    className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground"
                    title={`${lowStock} item${lowStock === 1 ? "" : "s"} running low`}
                  >
                    {lowStock} low
                  </span>
                )}
              </Link>
            </Button>
          ))}
        </nav>
      </div>
    </header>
  );
}
