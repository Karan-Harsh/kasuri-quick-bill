import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ShoppingBag, Utensils } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { computeTotals, inr } from "@/lib/kasuri";
import { orderKitchenStatus, orderKitchenStatusLabel, playKitchenAlert } from "@/lib/kitchen";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Table board — Kasuri" }] }),
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
    queryFn: () => api.get<{ id: string; table_number: number; label: string }[]>("/tables"),
  });

  const openOrdersQuery = useQuery({
    queryKey: ["open-orders"],
    refetchInterval: 20_000,
    queryFn: () =>
      api.get<
        {
          id: string;
          table_id: string | null;
          order_type: string;
          bill_number: number;
          created_at: string;
          kitchen_ready_at: string | null;
          open_ticket_count: number;
          order_items: {
            unit_price: number;
            tax_rate: number;
            quantity: number;
            kitchen_sent_at: string | null;
          }[];
        }[]
      >("/orders/open"),
  });

  const acknowledgeReady = useMutation({
    mutationFn: (orderId: string) => api.post(`/orders/${orderId}/acknowledge-ready`),
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
    queryFn: () =>
      api.get<{ sales: number; orders: number; parcels: number }>(
        `/stats/today?from=${encodeURIComponent(startOfToday())}`,
      ),
  });

  const startOrder = useMutation({
    mutationFn: async (input: { tableId: string | null }) =>
      (await api.post<{ id: string }>("/orders", { table_id: input.tableId })).id,
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
                    onClick={() =>
                      navigate({ to: "/order/$orderId", params: { orderId: order.id } })
                    }
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
