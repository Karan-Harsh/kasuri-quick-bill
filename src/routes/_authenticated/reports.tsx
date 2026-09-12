import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inr, paymentLabel, PAYMENT_METHODS } from "@/lib/kasuri";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Sales reports — Kasuri" },
      {
        name: "description",
        content: "Daily, weekly and monthly sales, item-wise and payment-wise, for Kasuri.",
      },
      { property: "og:title", content: "Sales reports — Kasuri" },
      {
        property: "og:description",
        content: "Daily, weekly and monthly sales, item-wise and payment-wise, for Kasuri.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Reports,
});

type Preset = "today" | "week" | "month" | "custom";

const toInputDate = (date: Date) => {
  const offset = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(offset).toISOString().slice(0, 10);
};

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { from: toInputDate(start), to: toInputDate(today) };
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toInputDate(start), to: toInputDate(today) };
  }
  return { from: toInputDate(today), to: toInputDate(today) };
}

function Reports() {
  const [preset, setPreset] = useState<Preset>("today");
  const [range, setRange] = useState(presetRange("today"));

  const applyPreset = (next: Preset) => {
    setPreset(next);
    if (next !== "custom") setRange(presetRange(next));
  };

  const fromIso = useMemo(() => new Date(`${range.from}T00:00:00`).toISOString(), [range.from]);
  const toIso = useMemo(() => new Date(`${range.to}T23:59:59.999`).toISOString(), [range.to]);

  const reportQuery = useQuery({
    queryKey: ["reports", fromIso, toIso],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, order_type, payment_method, subtotal, discount, tax_amount, total, completed_at")
        .eq("status", "COMPLETED")
        .gte("completed_at", fromIso)
        .lte("completed_at", toIso)
        .order("completed_at", { ascending: false });
      if (error) throw error;

      const ids = orders.map((order) => order.id);
      let lines: {
        item_name: string;
        quantity: number;
        unit_price: number;
      }[] = [];
      if (ids.length > 0) {
        const { data: itemRows, error: itemError } = await supabase
          .from("order_items")
          .select("item_name, quantity, unit_price")
          .in("order_id", ids);
        if (itemError) throw itemError;
        lines = itemRows.map((row) => ({
          item_name: row.item_name,
          quantity: row.quantity,
          unit_price: Number(row.unit_price),
        }));
      }
      return { orders, lines };
    },
  });

  const orders = reportQuery.data?.orders ?? [];
  const lines = reportQuery.data?.lines ?? [];

  const totalSales = orders.reduce((sum, order) => sum + Number(order.total), 0);
  const totalTax = orders.reduce((sum, order) => sum + Number(order.tax_amount), 0);
  const totalDiscount = orders.reduce((sum, order) => sum + Number(order.discount), 0);
  const dineIn = orders.filter((order) => order.order_type === "DINE_IN");
  const parcel = orders.filter((order) => order.order_type === "PARCEL");

  const itemRows = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; amount: number }>();
    for (const line of lines) {
      const current = map.get(line.item_name) ?? { name: line.item_name, qty: 0, amount: 0 };
      current.qty += line.quantity;
      current.amount += line.unit_price * line.quantity;
      map.set(line.item_name, current);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [lines]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <h1 className="text-3xl font-bold">Sales reports</h1>

        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            {(["today", "week", "month", "custom"] as Preset[]).map((option) => (
              <Button
                key={option}
                variant={preset === option ? "default" : "outline"}
                className="h-11 text-base capitalize"
                onClick={() => applyPreset(option)}
              >
                {option === "week"
                  ? "Last 7 days"
                  : option === "month"
                    ? "This month"
                    : option === "today"
                      ? "Today"
                      : "Custom"}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="from">From</Label>
              <Input
                id="from"
                type="date"
                value={range.from}
                className="h-11"
                onChange={(e) => {
                  setPreset("custom");
                  setRange((r) => ({ ...r, from: e.target.value }));
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="date"
                value={range.to}
                className="h-11"
                onChange={(e) => {
                  setPreset("custom");
                  setRange((r) => ({ ...r, to: e.target.value }));
                }}
              />
            </div>
          </div>
        </Card>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total sales" value={inr(totalSales)} />
          <Stat label="Orders" value={String(orders.length)} />
          <Stat label="GST collected" value={inr(totalTax)} />
          <Stat label="Discounts given" value={inr(totalDiscount)} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-5">
            <h2 className="text-xl font-bold">Dine-in vs parcel</h2>
            <Line
              label={`Dine-in (${dineIn.length} orders)`}
              value={inr(dineIn.reduce((sum, o) => sum + Number(o.total), 0))}
            />
            <Line
              label={`Parcel (${parcel.length} orders)`}
              value={inr(parcel.reduce((sum, o) => sum + Number(o.total), 0))}
            />
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="text-xl font-bold">Payment methods</h2>
            {PAYMENT_METHODS.map((method) => {
              const forMethod = orders.filter((order) => order.payment_method === method);
              return (
                <Line
                  key={method}
                  label={`${paymentLabel(method)} (${forMethod.length} orders)`}
                  value={inr(forMethod.reduce((sum, o) => sum + Number(o.total), 0))}
                />
              );
            })}
          </Card>
        </section>

        <Card className="p-5">
          <h2 className="mb-3 text-xl font-bold">Item-wise sales</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Qty sold</th>
                  <th className="py-2 text-right">Sales amount</th>
                </tr>
              </thead>
              <tbody>
                {itemRows.map((row) => (
                  <tr key={row.name} className="border-b border-border/60">
                    <td className="py-2">{row.name}</td>
                    <td className="py-2 text-right font-semibold">{row.qty}</td>
                    <td className="py-2 text-right font-semibold">{inr(row.amount)}</td>
                  </tr>
                ))}
                {itemRows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-muted-foreground">
                      No settled bills in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-3xl font-extrabold">{value}</p>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2 text-base">
      <span>{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
