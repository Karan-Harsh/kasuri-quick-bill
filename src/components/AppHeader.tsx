import { Link } from "@tanstack/react-router";
import { BarChart3, BookOpen, ChefHat, LayoutGrid, Package, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Tables", icon: LayoutGrid },
  { to: "/menu", label: "Menu", icon: BookOpen },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/kitchen", label: "Kitchen", icon: ChefHat },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppHeader() {
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
              </Link>
            </Button>
          ))}
        </nav>
      </div>
    </header>
  );
}
