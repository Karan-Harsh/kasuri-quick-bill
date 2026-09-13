import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ShoppingBag, Utensils } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { computeTotals, inr } from "@/lib/kasuri";
import {
  orderKitchenStatus,
  orderKitchenStatusLabel,
  playKitchenAlert,
} from "@/lib/kitchen";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Table board — Kasuri" },
      { name: "description", content: "Live table status and today's sales at Kasuri." },
      { property: "og:title", content: "Table board — Kasuri" },
      { property: "og:description", content: "Live table status and today's sales at Kasuri." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
};

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: orgSettings } = useOrganizationSettings();
  const gstEnabled = orgSettings?.gst_enabled ?? false;

  const tablesQuery = useQuery({
    queryKey: ["tables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("id, table_number, label")
        .order("table_number");
      if (error) throw error;
      return data;
    },
  });

  const openOrdersQuery = useQuery({
    queryKey: ["open-orders"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const [{ data: orders, error: ordersError }, { data: openTickets, error: ticketsError }] =
        await Promise.all([
          supabase
            .from("orders")
            .select(
              "id, table_id, order_type, bill_number, created_at, kitchen_ready_at, order_items(unit_price, tax_rate, quantity, kitchen_sent_at)",
            )
            .eq("status", "OPEN")
            .order("created_at"),
          supabase.from("kitchen_tickets").select("order_id").eq("status", "OPEN"),
        ]);
      if (ordersError) throw ordersError;
      if (ticketsError) throw ticketsError;

      const openTicketCount = new Map<string, number>();
      for (const ticket of openTickets ?? []) {
        openTicketCount.set(ticket.order_id, (openTicketCount.get(ticket.order_id) ?? 0) + 1);
      }

      return (orders ?? []).map((order) => ({
        ...order,
        open_ticket_count: openTicketCount.get(order.id) ?? 0,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-kitchen")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["open-orders"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kitchen_tickets" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["open-orders"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const acknowledgeReady = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc("acknowledge_kitchen_ready", {
        p_order_id: orderId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["open-orders"] });
      toast.success("Marked as served");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update table"),
  });

  const todayQuery = useQuery({
    queryKey: ["today-stats"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_type, total")
        .eq("status", "COMPLETED")
        .gte("completed_at", startOfToday());
      if (error) throw error;
      const sales = data.reduce((sum, order) => sum + Number(order.total), 0);
      const parcels = data.filter((order) => order.order_type === "PARCEL").length;
      return { sales, orders: data.length, parcels };
    },
  });

  const startOrder = useMutation({
    mutationFn: async (input: { tableId: string | null }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("orders")
        .insert({
          order_type: input.tableId ? "DINE_IN" : "PARCEL",
          table_id: input.tableId,
          created_by: userData.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (orderId) => {
      queryClient.invalidateQueries({ queryKey: ["open-orders"] });
      navigate({ to: "/order/$orderId", params: { orderId } });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not start the order"),
  });

  const openOrders = openOrdersQuery.data ?? [];
  const parcelOrders = openOrders.filter((order) => order.order_type === "PARCEL");
  const readyCount = openOrders.filter((order) => order.kitchen_ready_at).length;
  const prevReadyCountRef = useRef(0);

  useEffect(() => {
    if (readyCount > prevReadyCountRef.current) {
      playKitchenAlert();
    }
    prevReadyCountRef.current = readyCount;
  }, [readyCount]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Today's sales" value={inr(todayQuery.data?.sales ?? 0)} />
          <StatCard label="Orders today" value={String(todayQuery.data?.orders ?? 0)} />
          <StatCard label="Parcels today" value={String(todayQuery.data?.parcels ?? 0)} />
        </section>

        <Button
          size="lg"
          className="h-20 w-full text-2xl font-bold shadow-sm"
          disabled={startOrder.isPending}
          onClick={() => startOrder.mutate({ tableId: null })}
        >
          <ShoppingBag className="mr-3 size-7" /> New Parcel Bill
        </Button>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Tables</h2>
            {readyCount > 0 && (
              <p className="animate-pulse rounded-full bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-700">
                {readyCount} ready to serve
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(tablesQuery.data ?? []).map((table) => {
              const order = openOrders.find((o) => o.table_id === table.id);
              const totals = order ? computeTotals(order.order_items, 0, { gstEnabled }) : null;
              const kitchenStatus = order ? orderKitchenStatus(order) : "none";
              const kitchenLabel = orderKitchenStatusLabel(kitchenStatus);
              const isReady = kitchenStatus === "ready";
              return (
                <button
                  key={table.id}
                  type="button"
                  disabled={startOrder.isPending}
                  onClick={() =>
                    order
                      ? navigate({ to: "/order/$orderId", params: { orderId: order.id } })
                      : startOrder.mutate({ tableId: table.id })
                  }
                  className={`flex h-44 flex-col justify-between rounded-xl border-2 p-4 text-left transition active:scale-[0.99] ${
                    isReady
                      ? "border-emerald-500 bg-emerald-500/10 text-foreground shadow-[0_0_0_1px_rgba(16,185,129,0.35)] animate-pulse"
                      : order
                        ? "border-occupied bg-occupied text-occupied-foreground"
                        : "border-available/40 bg-card hover:border-available"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-extrabold">{table.label}</span>
                    <Utensils className="size-6 opacity-60" />
                  </div>
                  {order && totals ? (
                    <div className="space-y-2">
                      {kitchenLabel && (
                        <p
                          className={`text-xs font-bold uppercase tracking-[0.16em] ${
                            isReady ? "text-emerald-700" : "opacity-80"
                          }`}
                        >
                          {kitchenLabel}
                        </p>
                      )}
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-wide">
                          Bill #{order.bill_number}
                        </p>
                        <p className="text-2xl font-bold">{inr(totals.total)}</p>
                        <p className="text-sm opacity-80">{totals.itemCount} item(s)</p>
                      </div>
                      {isReady && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            acknowledgeReady.mutate(order.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              acknowledgeReady.mutate(order.id);
                            }
                          }}
                          className="inline-flex rounded-md bg-emerald-600 px-3 py-1 text-xs font-bold text-white"
                        >
                          Mark served
                        </span>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-lg font-semibold text-available">Available</p>
                      <p className="text-sm text-muted-foreground">Tap to start an order</p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {parcelOrders.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-bold">Open parcel bills</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {parcelOrders.map((order) => {
                const totals = computeTotals(order.order_items, 0, { gstEnabled });
                const kitchenStatus = orderKitchenStatus(order);
                const kitchenLabel = orderKitchenStatusLabel(kitchenStatus);
                const isReady = kitchenStatus === "ready";
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => navigate({ to: "/order/$orderId", params: { orderId: order.id } })}
                    className={`rounded-xl border-2 p-4 text-left transition ${
                      isReady
                        ? "border-emerald-500 bg-emerald-500/10 animate-pulse"
                        : "border-primary/40 bg-card hover:border-primary"
                    }`}
                  >
                    {kitchenLabel && (
                      <p
                        className={`mb-2 text-xs font-bold uppercase tracking-[0.16em] ${
                          isReady ? "text-emerald-700" : "text-primary"
                        }`}
                      >
                        {kitchenLabel}
                      </p>
                    )}
                    <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                      Parcel · Bill #{order.bill_number}
                    </p>
                    <p className="text-2xl font-bold">{inr(totals.total)}</p>
                    <p className="text-sm text-muted-foreground">{totals.itemCount} item(s)</p>
                    {isReady && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          acknowledgeReady.mutate(order.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            acknowledgeReady.mutate(order.id);
                          }
                        }}
                        className="mt-3 inline-flex rounded-md bg-emerald-600 px-3 py-1 text-xs font-bold text-white"
                      >
                        Mark served
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-4xl font-extrabold">{value}</p>
    </Card>
  );
}
