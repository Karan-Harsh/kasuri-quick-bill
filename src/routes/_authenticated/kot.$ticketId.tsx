import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatKitchenTime, kitchenLocationLabel } from "@/lib/kitchen";
import { orderTypeLabel } from "@/lib/kasuri";

export const Route = createFileRoute("/_authenticated/kot/$ticketId")({
  validateSearch: (search: Record<string, unknown>) => ({
    print: search["print"] === "1" || search["print"] === true,
  }),
  head: () => ({
    meta: [
      { title: "Kitchen order ticket — Kasuri" },
      { name: "description", content: "Printable kitchen order ticket for Kasuri." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: KotPrint,
});

function KotPrint() {
  const { ticketId } = Route.useParams();
  const { print: autoPrint } = Route.useSearch();
  const printedRef = useRef(false);

  const ticketQuery = useQuery({
    queryKey: ["kot", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kitchen_tickets")
        .select(
          "*, orders(bill_number, order_type, restaurant_tables(label)), order_items!order_items_kitchen_ticket_id_fkey(id, item_name, quantity)",
        )
        .eq("id", ticketId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const ticket = ticketQuery.data;

  useEffect(() => {
    if (!autoPrint || !ticket || printedRef.current) return;
    printedRef.current = true;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [autoPrint, ticket]);

  if (!ticket) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">
          {ticketQuery.isLoading ? "Loading KOT…" : "Ticket not found."}
        </p>
      </div>
    );
  }

  const order = ticket.orders;
  const lines = [...(ticket.order_items ?? [])].sort((a, b) =>
    a.item_name.localeCompare(b.item_name),
  );
  const location = kitchenLocationLabel({
    order_type: order?.order_type ?? "DINE_IN",
    table_label: order?.restaurant_tables?.label ?? null,
    bill_number: order?.bill_number ?? 0,
  });

  return (
    <div className="min-h-screen bg-muted/40 py-8">
      <div className="no-print mx-auto mb-4 flex max-w-md items-center justify-between px-4">
        <Button asChild variant="outline" className="h-11">
          <Link to="/dashboard">
            <ArrowLeft className="mr-2 size-4" /> Back
          </Link>
        </Button>
        <Button className="h-11" onClick={() => window.print()}>
          <Printer className="mr-2 size-4" /> Print KOT
        </Button>
      </div>

      <div className="print-sheet mx-auto max-w-md border border-border bg-card p-6 shadow-sm">
        <header className="border-b-2 border-dashed border-border pb-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Kitchen order ticket
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">Kasuri</h1>
          <p className="mt-1 text-2xl font-bold">KOT #{ticket.kot_number}</p>
        </header>

        <div className="space-y-1 py-4 text-sm">
          <p>
            <span className="text-muted-foreground">For:</span>{" "}
            <strong className="text-lg">{location}</strong>
          </p>
          <p>
            <span className="text-muted-foreground">Type:</span>{" "}
            {orderTypeLabel(order?.order_type ?? "DINE_IN")}
          </p>
          <p>
            <span className="text-muted-foreground">Bill:</span> #{order?.bill_number}
          </p>
          <p>
            <span className="text-muted-foreground">Time:</span>{" "}
            {formatKitchenTime(ticket.sent_at)}
          </p>
        </div>

        <table className="w-full text-base">
          <thead>
            <tr className="border-y border-border text-left">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-dashed border-border">
                <td className="py-2 font-semibold">{line.item_name}</td>
                <td className="py-2 text-right text-xl font-extrabold">{line.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          No prices · Kitchen copy only
        </p>
      </div>
    </div>
  );
}
