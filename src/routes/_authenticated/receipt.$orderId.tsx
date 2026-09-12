import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { inr, orderTypeLabel, paymentLabel } from "@/lib/kasuri";

export const Route = createFileRoute("/_authenticated/receipt/$orderId")({
  head: () => ({
    meta: [
      { title: "Receipt — Kasuri" },
      { name: "description", content: "Printable GST invoice for a Kasuri bill." },
      { property: "og:title", content: "Receipt — Kasuri" },
      { property: "og:description", content: "Printable GST invoice for a Kasuri bill." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Receipt,
});

function Receipt() {
  const { orderId } = Route.useParams();

  const orderQuery = useQuery({
    queryKey: ["receipt", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, restaurant_tables(label), order_items(*)")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const order = orderQuery.data;

  if (!order) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">
          {orderQuery.isLoading ? "Loading receipt…" : "Bill not found."}
        </p>
      </div>
    );
  }

  const lines = [...order.order_items].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const created = new Date(order.completed_at ?? order.created_at);

  return (
    <div className="min-h-screen bg-muted/40 py-8">
      <div className="no-print mx-auto mb-4 flex max-w-2xl items-center justify-between px-4">
        <Button asChild variant="outline" className="h-11">
          <Link to="/dashboard">
            <ArrowLeft className="mr-2 size-4" /> Tables
          </Link>
        </Button>
        <Button className="h-11" onClick={() => window.print()}>
          <Printer className="mr-2 size-4" /> Print bill
        </Button>
      </div>

      <div className="print-sheet mx-auto max-w-2xl border border-border bg-card p-8 shadow-sm">
        <header className="border-b border-dashed border-border pb-4 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight">Kasuri</h1>
          <p className="text-sm text-muted-foreground">Restaurant · Tax invoice</p>
        </header>

        <div className="grid grid-cols-2 gap-2 py-4 text-sm">
          <p>
            <span className="text-muted-foreground">Bill No:</span>{" "}
            <strong>#{order.bill_number}</strong>
          </p>
          <p className="text-right">
            <span className="text-muted-foreground">Date:</span>{" "}
            {created.toLocaleString("en-IN")}
          </p>
          <p>
            <span className="text-muted-foreground">Type:</span>{" "}
            {orderTypeLabel(order.order_type)}
            {order.restaurant_tables?.label ? ` · Table ${order.restaurant_tables.label}` : ""}
          </p>
          <p className="text-right">
            <span className="text-muted-foreground">Payment:</span>{" "}
            {paymentLabel(order.payment_method)}
          </p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-border text-left">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">GST</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-dashed border-border">
                <td className="py-2">{line.item_name}</td>
                <td className="py-2 text-right">{inr(Number(line.unit_price))}</td>
                <td className="py-2 text-right">{line.quantity}</td>
                <td className="py-2 text-right">{Number(line.tax_rate)}%</td>
                <td className="py-2 text-right">
                  {inr(Number(line.unit_price) * line.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
          <Row label="Subtotal" value={inr(Number(order.subtotal))} />
          {Number(order.discount) > 0 && (
            <Row label="Discount" value={`- ${inr(Number(order.discount))}`} />
          )}
          <Row label="GST" value={inr(Number(order.tax_amount))} />
          <div className="flex justify-between border-t border-border pt-2 text-xl font-extrabold">
            <span>Total</span>
            <span>{inr(Number(order.total))}</span>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Thank you for dining with Kasuri!
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
