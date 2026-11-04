import { Link } from "@tanstack/react-router";
import { BarChart3, BookOpen, ChefHat, LayoutGrid, Package, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStaff } from "@/hooks/useStaff";

export function AppHeader() {
  const { data: staff } = useStaff();
  const isKitchen = staff?.role === "kitchen";

  return (
    <header className="no-print sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <Link
          to={isKitchen ? "/kitchen" : "/dashboard"}
          className="mr-2 text-2xl font-extrabold tracking-tight"
        >
          Kasuri
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-2">
          {isKitchen ? (
            <Button asChild variant="ghost" className="h-11 text-base">
              <Link to="/kitchen" activeProps={{ className: "bg-accent" }}>
                <ChefHat className="mr-2 size-5" /> Kitchen
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="h-11 text-base">
                <Link to="/dashboard" activeProps={{ className: "bg-accent" }}>
                  <LayoutGrid className="mr-2 size-5" /> Tables
                </Link>
              </Button>
              <Button asChild variant="ghost" className="h-11 text-base">
                <Link to="/menu" activeProps={{ className: "bg-accent" }}>
                  <BookOpen className="mr-2 size-5" /> Menu
                </Link>
              </Button>
              <Button asChild variant="ghost" className="h-11 text-base">
                <Link to="/reports" activeProps={{ className: "bg-accent" }}>
                  <BarChart3 className="mr-2 size-5" /> Reports
                </Link>
              </Button>
              <Button asChild variant="ghost" className="h-11 text-base">
                <Link to="/kitchen" activeProps={{ className: "bg-accent" }}>
                  <ChefHat className="mr-2 size-5" /> Kitchen
                </Link>
              </Button>
              {staff?.role === "admin" && (
                <Button asChild variant="ghost" className="h-11 text-base">
                  <Link to="/inventory" activeProps={{ className: "bg-accent" }}>
                    <Package className="mr-2 size-5" /> Inventory
                  </Link>
                </Button>
              )}
              {staff?.role === "admin" && (
                <Button asChild variant="ghost" className="h-11 text-base">
                  <Link to="/settings" activeProps={{ className: "bg-accent" }}>
                    <Settings className="mr-2 size-5" /> Settings
                  </Link>
                </Button>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
