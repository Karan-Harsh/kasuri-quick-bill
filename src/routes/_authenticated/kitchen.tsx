import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { CheckCircle2, ChefHat } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatKitchenTime, kitchenLocationLabel, type KitchenTicketSummary } from "@/lib/kitchen";
import { useStaff } from "@/hooks/useStaff";

export const Route = createFileRoute("/_authenticated/kitchen")({
  head: () => ({
    meta: [
      { title: "Kitchen — Kasuri" },
      { name: "description", content: "Live kitchen order queue for Kasuri." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: KitchenScreen,
});

function KitchenScreen() {
  const queryClient = useQueryClient();
  const { data: staff } = useStaff();

  const ticketsQuery = useQuery({
    queryKey: ["kitchen-tickets", "open"],
    refetchInterval: 15_000,
    queryFn: async (): Promise<KitchenTicketSummary[]> => {
      const { data, error } = await supabase
        .from("kitchen_tickets")
        .select(
          "id, kot_number, status, sent_at, completed_at, order_id, orders(bill_number, order_type, restaurant_tables(label)), order_items!order_items_kitchen_ticket_id_fkey(id, item_name, quantity)",
        )
        .eq("status", "OPEN")
        .order("sent_at", { ascending: true });
      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.id,
        kot_number: row.kot_number,
        status: row.status as KitchenTicketSummary["status"],
        sent_at: row.sent_at,
        completed_at: row.completed_at,
        order_id: row.order_id,
        bill_number: row.orders?.bill_number ?? 0,
        order_type: row.orders?.order_type ?? "DINE_IN",
        table_label: row.orders?.restaurant_tables?.label ?? null,
        lines: (row.order_items ?? []).map((line) => ({
          id: line.id,
          item_name: line.item_name,
          quantity: line.quantity,
        })),
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("kitchen-tickets")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kitchen_tickets" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["kitchen-tickets", "open"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const markDone = useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase.rpc("complete_kitchen_ticket", {
        p_ticket_id: ticketId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kitchen-tickets", "open"] });
      toast.success("Ticket marked ready");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update ticket"),
  });

  const tickets = ticketsQuery.data ?? [];
  const isKitchenRole = staff?.role === "kitchen";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold">
              <ChefHat className="size-8" /> Kitchen
            </h1>
            <p className="mt-1 text-muted-foreground">
              {isKitchenRole
                ? "New orders appear here. Tap ready when done."
                : "Live queue — same tickets that print at the counter."}
            </p>
          </div>
          <p className="rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
            {tickets.length} open {tickets.length === 1 ? "ticket" : "tickets"}
          </p>
        </div>

        {ticketsQuery.isLoading && (
          <p className="text-muted-foreground">Loading kitchen queue…</p>
        )}

        {!ticketsQuery.isLoading && tickets.length === 0 && (
          <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <ChefHat className="size-12 text-muted-foreground/50" />
            <p className="text-xl font-semibold">All caught up</p>
            <p className="text-muted-foreground">New KOTs will show up here when the counter sends them.</p>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="flex flex-col gap-4 border-2 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    KOT #{ticket.kot_number}
                  </p>
                  <p className="text-2xl font-extrabold">
                    {kitchenLocationLabel(ticket)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatKitchenTime(ticket.sent_at)} · Bill #{ticket.bill_number}
                  </p>
                </div>
              </div>

              <ul className="flex-1 space-y-2">
                {ticket.lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-center justify-between border-b border-dashed border-border pb-2 last:border-0"
                  >
                    <span className="font-semibold">{line.item_name}</span>
                    <span className="text-xl font-extrabold tabular-nums">{line.quantity}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="h-12 w-full text-base font-bold"
                disabled={markDone.isPending}
                onClick={() => markDone.mutate(ticket.id)}
              >
                <CheckCircle2 className="mr-2 size-5" /> Mark ready
              </Button>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
