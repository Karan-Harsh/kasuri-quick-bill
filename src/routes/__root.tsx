import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
} from "@tanstack/react-router";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { api, useLiveUpdates, type AppSettings } from "@/lib/api";
import { formatQuantity, isLowStock } from "@/lib/inventory";
import { playKitchenAlert } from "@/lib/kitchen";
import { useInventoryItems } from "@/lib/low-stock";
import { printKotInBackground } from "@/lib/print-kot";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const detail =
    error instanceof Error && error.message && !error.message.includes("HTTPError")
      ? error.message
      : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        {detail && (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-xs text-destructive">
            {detail}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({ meta: [{ title: "Kasuri — Restaurant Billing" }] }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <HeadContent />
      <LiveUpdates />
      <LowStockAlerts />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}

/** Pops up a warning when a stock item drops below its minimum level (e.g. after a bill uses it up). */
function LowStockAlerts() {
  const router = useRouter();
  const { data } = useInventoryItems();
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const low = data.filter((item) => item.is_active && isLowStock(item));
    const ids = new Set(low.map((item) => item.id));
    // Items already low when the app opens are shown on the Inventory screen, not popped up.
    if (known.current) {
      for (const item of low) {
        if (known.current.has(item.id)) continue;
        toast.warning(`${item.name} is running low`, {
          description: `${formatQuantity(Number(item.current_quantity), item.unit)} left · minimum ${formatQuantity(Number(item.low_stock_level), item.unit)}`,
          duration: 10000,
          action: { label: "Open inventory", onClick: () => router.navigate({ to: "/inventory" }) },
        });
      }
    }
    known.current = ids;
  }, [data, router]);
  return null;
}

/**
 * Keeps screens in sync with the local server and warns if it stops responding.
 * When a waiter sends an order from a phone: chime, pop-up, and (if turned on) print the KOT here.
 */
function LiveUpdates() {
  const { data: appSettings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => api.get<AppSettings>("/app-settings"),
  });
  const connected = useLiveUpdates((kot) => {
    playKitchenAlert();
    const where = kot.table_label ? `Table ${kot.table_label}` : `Bill #${kot.bill_number}`;
    toast.success(`${where} · order from ${kot.waiter}`, {
      description: `KOT #${kot.kot_number} sent to the kitchen`,
      duration: 8000,
    });
    if (appSettings?.auto_print_waiter_kot ?? true) printKotInBackground(kot.ticket_id);
  });

  // Only warn if the connection stays down; brief drops (e.g. switching waiter phones on) reconnect by themselves.
  const [showWarning, setShowWarning] = useState(false);
  useEffect(() => {
    if (connected) {
      setShowWarning(false);
      return;
    }
    const timer = setTimeout(() => setShowWarning(true), 3000);
    return () => clearTimeout(timer);
  }, [connected]);
  if (!showWarning) return null;
  return (
    <div className="no-print fixed inset-x-0 top-0 z-50 bg-destructive px-4 py-2 text-center text-sm font-semibold text-destructive-foreground">
      Lost connection to the Kasuri server. Reconnecting…
    </div>
  );
}
