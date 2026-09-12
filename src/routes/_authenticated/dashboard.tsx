import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShoppingBag, Utensils } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { computeTotals, inr } from "@/lib/kasuri";
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
      const { data, error } = await supabase
        .from("orders")
        .select("id, table_id, order_type, bill_number, created_at, order_items(unit_price, tax_rate, quantity)")
        .eq("status", "OPEN")
        .order("created_at");
      if (error) throw error;
      return data;
    },
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
          <h2 className="text-xl font-bold">Tables</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(tablesQuery.data ?? []).map((table) => {
              const order = openOrders.find((o) => o.table_id === table.id);
              const totals = order ? computeTotals(order.order_items, 0, { gstEnabled }) : null;
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
                  className={`flex h-40 flex-col justify-between rounded-xl border-2 p-4 text-left transition active:scale-[0.99] ${
                    order
                      ? "border-occupied bg-occupied text-occupied-foreground"
                      : "border-available/40 bg-card hover:border-available"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-extrabold">{table.label}</span>
                    <Utensils className="size-6 opacity-60" />
                  </div>
                  {order && totals ? (
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide">
                        Bill #{order.bill_number}
                      </p>
                      <p className="text-2xl font-bold">{inr(totals.total)}</p>
                      <p className="text-sm opacity-80">{totals.itemCount} item(s)</p>
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
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => navigate({ to: "/order/$orderId", params: { orderId: order.id } })}
                    className="rounded-xl border-2 border-primary/40 bg-card p-4 text-left transition hover:border-primary"
                  >
                    <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                      Parcel · Bill #{order.bill_number}
                    </p>
                    <p className="text-2xl font-bold">{inr(totals.total)}</p>
                    <p className="text-sm text-muted-foreground">{totals.itemCount} item(s)</p>
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
