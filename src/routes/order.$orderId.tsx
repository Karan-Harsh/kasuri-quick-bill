import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChefHat, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  computeTotals,
  inr,
  PAYMENT_METHODS,
  paymentLabel,
  type PaymentMethod,
} from "@/lib/kasuri";
import { printKotInBackground } from "@/lib/print-kot";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";

interface Order {
  id: string;
  bill_number: number;
  order_type: string;
  table_id: string | null;
  status: string;
  discount: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  payment_method: string | null;
  created_at: string;
  completed_at: string | null;
  kitchen_ready_at: string | null;
  restaurant_tables: { label: string } | null;
}

interface OrderLine {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name: string;
  unit_price: number;
  tax_rate: number;
  quantity: number;
  created_at: string;
  kitchen_ticket_id: string | null;
  kitchen_sent_at: string | null;
}

export const Route = createFileRoute("/order/$orderId")({
  head: () => ({ meta: [{ title: "Take order — Kasuri" }] }),
  component: OrderScreen,
});

function OrderScreen() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [discountText, setDiscountText] = useState("0");
  const [method, setMethod] = useState<PaymentMethod>("CASH");

  const orderQuery = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.get<Order>(`/orders/${orderId}`),
  });

  const itemsQuery = useQuery({
    queryKey: ["order-items", orderId],
    queryFn: () => api.get<OrderLine[]>(`/orders/${orderId}/items`),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<{ id: string; name: string; sort_order: number }[]>("/categories"),
  });

  const menuQuery = useQuery({
    queryKey: ["menu-items", "active"],
    queryFn: () =>
      api.get<{ id: string; name: string; price: number; tax_rate: number; category_id: string }[]>(
        "/menu-items?active=1",
      ),
  });

  const order = orderQuery.data;
  const items = itemsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const { data: orgSettings } = useOrganizationSettings();
  const gstEnabled = orgSettings?.gst_enabled ?? false;

  useEffect(() => {
    if (!activeCategory && categories[0]) setActiveCategory(categories[0].id);
  }, [activeCategory, categories]);

  useEffect(() => {
    if (order) setDiscountText(String(Number(order.discount) || 0));
  }, [order?.id]);

  const totals = useMemo(
    () => computeTotals(items, Number(discountText) || 0, { gstEnabled }),
    [items, discountText, gstEnabled],
  );

  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const refreshItems = () => {
    queryClient.invalidateQueries({ queryKey: ["order-items", orderId] });
    queryClient.invalidateQueries({ queryKey: ["open-orders"] });
  };

  // The server merges repeat taps into one line and only puts new quantity on unsent lines.
  async function addLine(menuItem: { id: string }) {
    await api.post(`/orders/${orderId}/items`, { menu_item_id: menuItem.id });
  }

  // Taps are queued so two quick taps on the same item never race.
  const addItem = useMutation({
    mutationFn: (menuItem: { id: string; name: string; price: number; tax_rate: number }) => {
      const next = queueRef.current.then(() => addLine(menuItem));
      queueRef.current = next.catch(() => undefined);
      return next;
    },
    onSuccess: refreshItems,
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add item"),
  });

  const changeQty = useMutation({
    mutationFn: (input: { id: string; quantity: number }) =>
      api.patch(`/order-items/${input.id}`, { quantity: Math.max(0, input.quantity) }),
    onSuccess: refreshItems,
  });

  const sendToKitchen = useMutation({
    mutationFn: () =>
      api.post<{ id: string; kot_number: number }>(`/orders/${orderId}/send-to-kitchen`),
    onSuccess: (ticket) => {
      refreshItems();
      queryClient.invalidateQueries({ queryKey: ["open-orders"] });
      toast.success(`Sent to kitchen · KOT #${ticket.kot_number}`);
      printKotInBackground(ticket.id);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not send to kitchen"),
  });

  const settle = useMutation({
    // Totals are recalculated by the server from the saved lines.
    mutationFn: async () => {
      if (items.length === 0) throw new Error("Add at least one item before settling");
      await api.post(`/orders/${orderId}/settle`, {
        discount: totals.discount,
        payment_method: method,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["open-orders"] });
      queryClient.invalidateQueries({ queryKey: ["today-stats"] });
      toast.success("Bill settled");
      navigate({
        to: "/receipt/$orderId",
        params: { orderId },
        search: { print: true },
      });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not settle"),
  });

  const discardOrder = useMutation({
    mutationFn: () => api.del(`/orders/${orderId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["open-orders"] });
      toast.success("Order discarded");
      navigate({ to: "/dashboard" });
    },
  });

  if (orderQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <p className="p-8 text-muted-foreground">Loading order…</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="space-y-4 p-8">
          <p className="text-lg">This order no longer exists.</p>
          <Button asChild>
            <Link to="/dashboard">Back to tables</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isSettled = order.status !== "OPEN";
  const tableLabel = order.restaurant_tables?.label;
  const unsentCount = items.filter((line) => !line.kitchen_sent_at).length;
  const visibleItems = menuQuery.data?.filter((item) => item.category_id === activeCategory) ?? [];
  const billGstEnabled = isSettled ? Number(order.tax_amount) > 0 : gstEnabled;
  const displayTotals = isSettled
    ? {
        subtotal: Number(order.subtotal),
        discount: Number(order.discount),
        taxAmount: Number(order.tax_amount),
        total: Number(order.total),
      }
    : totals;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" className="h-11">
              <Link to="/dashboard">
                <ArrowLeft className="mr-2 size-4" /> Tables
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">
              {order.order_type === "PARCEL" ? "Parcel" : `Table ${tableLabel ?? ""}`} · Bill #
              {order.bill_number}
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={activeCategory === category.id ? "default" : "outline"}
                className="h-11 text-base"
                onClick={() => setActiveCategory(category.id)}
              >
                {category.name}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={isSettled}
                onClick={() =>
                  addItem.mutate({
                    id: item.id,
                    name: item.name,
                    price: Number(item.price),
                    tax_rate: Number(item.tax_rate),
                  })
                }
                className="rounded-xl border-2 border-border bg-card p-4 text-left transition hover:border-primary active:scale-[0.98] disabled:opacity-50"
              >
                <p className="text-lg font-semibold leading-tight">{item.name}</p>
                <p className="mt-2 text-xl font-bold text-primary">{inr(Number(item.price))}</p>
                {gstEnabled && (
                  <p className="text-xs text-muted-foreground">GST {Number(item.tax_rate)}%</p>
                )}
              </button>
            ))}
            {visibleItems.length === 0 && (
              <p className="text-muted-foreground">No active items in this category.</p>
            )}
          </div>
        </section>

        <Card className="h-fit lg:sticky lg:top-24 space-y-4 p-5">
          <h2 className="text-xl font-bold">Current bill</h2>
          <div className="space-y-2">
            {items.length === 0 && <p className="text-muted-foreground">No items yet.</p>}
            {items.map((line) => (
              <div key={line.id} className="flex items-center gap-2 border-b border-border pb-2">
                <div className="flex-1">
                  <p className="font-semibold leading-tight">{line.item_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {inr(Number(line.unit_price))}
                    {gstEnabled ? ` · GST ${Number(line.tax_rate)}%` : ""}
                    {line.kitchen_sent_at ? " · Sent to kitchen" : ""}
                  </p>
                </div>
                {!isSettled && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-9"
                      onClick={() => changeQty.mutate({ id: line.id, quantity: line.quantity - 1 })}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-8 text-center text-lg font-bold">{line.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-9"
                      onClick={() => changeQty.mutate({ id: line.id, quantity: line.quantity + 1 })}
                    >
                      <Plus className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-9 text-destructive"
                      onClick={() => changeQty.mutate({ id: line.id, quantity: 0 })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
                <span className="w-20 text-right font-semibold">
                  {inr(Number(line.unit_price) * line.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2 text-base">
            <Row label="Subtotal" value={inr(displayTotals.subtotal)} />
            <div className="flex items-center justify-between gap-3">
              <span>Discount (₹)</span>
              <Input
                type="number"
                min={0}
                step="1"
                disabled={isSettled}
                value={discountText}
                onChange={(e) => setDiscountText(e.target.value)}
                className="h-10 w-28 text-right"
              />
            </div>
            {billGstEnabled && <Row label="GST" value={inr(displayTotals.taxAmount)} />}
            <div className="flex items-center justify-between border-t border-border pt-3 text-2xl font-extrabold">
              <span>Total</span>
              <span>{inr(displayTotals.total)}</span>
            </div>
          </div>

          {isSettled ? (
            <div className="space-y-3">
              <p className="rounded-lg bg-available/15 p-3 text-sm font-semibold text-available">
                Paid by {paymentLabel(order.payment_method)}
              </p>
              <Button asChild className="h-12 w-full text-base">
                <Link to="/receipt/$orderId" params={{ orderId }} search={{ print: false }}>
                  View receipt
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                variant="secondary"
                className="h-14 w-full text-lg font-bold"
                disabled={sendToKitchen.isPending || unsentCount === 0}
                onClick={() => sendToKitchen.mutate()}
              >
                <ChefHat className="mr-2 size-5" />
                Send to kitchen
                {unsentCount > 0 ? ` (${unsentCount})` : ""}
              </Button>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((option) => (
                  <Button
                    key={option}
                    variant={method === option ? "default" : "outline"}
                    className="h-12 text-base"
                    onClick={() => setMethod(option)}
                  >
                    {paymentLabel(option)}
                  </Button>
                ))}
              </div>
              <Button
                className="h-14 w-full text-lg font-bold"
                disabled={settle.isPending || items.length === 0}
                onClick={() => settle.mutate()}
              >
                Settle & Print
              </Button>
              <Button
                variant="ghost"
                className="w-full text-destructive"
                onClick={() => discardOrder.mutate()}
              >
                Discard order
              </Button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
