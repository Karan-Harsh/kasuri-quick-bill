import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChefHat, Minus, Plus, Search, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/kasuri";
import { orderKitchenStatus } from "@/lib/kitchen";
import { api, NotPairedError, OfflineError, session, useCounterConnection } from "./connection";

// ---------- data shapes (same as the counter's API) ----------

interface Table {
  id: string;
  table_number: number;
  label: string;
}
interface OpenOrder {
  id: string;
  table_id: string | null;
  bill_number: number;
  kitchen_ready_at: string | null;
  open_ticket_count: number;
  order_items: { quantity: number; kitchen_sent_at: string | null }[];
}
interface Order {
  id: string;
  bill_number: number;
  status: string;
  kitchen_ready_at: string | null;
  restaurant_tables: { label: string } | null;
}
interface Line {
  id: string;
  menu_item_id: string | null;
  item_name: string;
  quantity: number;
  kitchen_sent_at: string | null;
}
interface MenuItem {
  id: string;
  name: string;
  price: number;
  /** Price of a half plate; null = no half plate. */
  half_price: number | null;
  category_id: string;
}

type Portion = "full" | "half";
/** A tap saved while offline: the dish id, with ":half" for a half plate. */
const tapKey = (id: string, portion: Portion) => (portion === "half" ? `${id}:half` : id);
const parseTap = (tap: string) => {
  const [id = "", half] = tap.split(":");
  return { id, portion: (half === "half" ? "half" : "full") as Portion };
};
interface Category {
  id: string;
  name: string;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function WaiterApp() {
  const [paired, setPaired] = useState(Boolean(session.token()));
  const [unpairedReason, setUnpairedReason] = useState<string | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const unpair = useCallback((reason?: string) => {
    session.clear();
    setUnpairedReason(reason ?? "This phone was removed on the counter. Scan the QR code again.");
    setPaired(false);
    setOpenOrderId(null);
  }, []);

  if (!paired) {
    return (
      <PairScreen
        reason={unpairedReason}
        onPaired={() => {
          setUnpairedReason(null);
          setPaired(true);
        }}
      />
    );
  }

  return <Paired unpair={unpair} openOrderId={openOrderId} setOpenOrderId={setOpenOrderId} />;
}

function Paired({
  unpair,
  openOrderId,
  setOpenOrderId,
}: {
  unpair: (reason?: string) => void;
  openOrderId: string | null;
  setOpenOrderId: (id: string | null) => void;
}) {
  const connected = useCounterConnection(useCallback(() => unpair(), [unpair]));

  // Any request rejected because of the key means this phone must pair again.
  const queryClient = useQueryClient();
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        const error = event.query.state.error;
        if (error instanceof NotPairedError) unpair(error.message);
      }),
    [queryClient, unpair],
  );

  return (
    <div className="min-h-dvh bg-background pb-28">
      {!connected && (
        <div className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground">
          <WifiOff className="size-4" /> Not connected to the counter. Reconnecting…
        </div>
      )}
      {openOrderId ? (
        <OrderScreen
          orderId={openOrderId}
          connected={connected}
          onBack={() => setOpenOrderId(null)}
          onUnpaired={unpair}
        />
      ) : (
        <TablesScreen onOpen={setOpenOrderId} onUnpaired={unpair} />
      )}
    </div>
  );
}

// ---------- pairing ----------

function PairScreen({ reason, onPaired }: { reason: string | null; onPaired: () => void }) {
  const fromQr = new URLSearchParams(location.hash.slice(1)).get("pair") ?? "";
  const [code, setCode] = useState(fromQr);
  const [name, setName] = useState(session.name() ?? "");

  const pair = useMutation({
    mutationFn: () =>
      api.post<{ token: string; device: { name: string } }>("/devices/pair", {
        code: code.trim(),
        name: name.trim(),
      }),
    onSuccess: ({ token, device }) => {
      session.save(token, device.name);
      history.replaceState(null, "", location.pathname);
      toast.success(`Connected as ${device.name}`);
      onPaired();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold">Kasuri</h1>
        <p className="mt-1 text-muted-foreground">Waiter phone</p>
      </div>
      {reason && <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900">{reason}</p>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          pair.mutate();
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Your name</span>
          <Input
            className="h-14 text-lg"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ramesh"
            autoFocus={!name}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Code shown on the counter</span>
          <Input
            className="h-14 text-center text-2xl font-bold tracking-[0.3em]"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
          />
        </label>
        <Button
          type="submit"
          className="h-14 w-full text-lg"
          disabled={pair.isPending || code.length !== 6 || !name.trim()}
        >
          Connect this phone
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        On the counter: Settings → Waiter phones → Add a phone.
      </p>
    </main>
  );
}

// ---------- tables ----------

function TablesScreen({
  onOpen,
  onUnpaired,
}: {
  onOpen: (orderId: string) => void;
  onUnpaired: (r?: string) => void;
}) {
  const tablesQuery = useQuery({
    queryKey: ["tables"],
    queryFn: () => api.get<Table[]>("/tables"),
  });
  const ordersQuery = useQuery({
    queryKey: ["open-orders"],
    queryFn: () => api.get<OpenOrder[]>("/orders/open"),
    refetchInterval: 30_000,
  });

  const startOrder = useMutation({
    mutationFn: (tableId: string) => api.post<{ id: string }>("/orders", { table_id: tableId }),
    onSuccess: ({ id }) => onOpen(id),
    onError: (e) =>
      e instanceof NotPairedError ? onUnpaired(e.message) : toast.error(errorText(e)),
  });

  const orders = ordersQuery.data ?? [];

  return (
    <>
      <header className="flex items-center justify-between px-4 pt-5 pb-3">
        <h1 className="text-2xl font-extrabold">Tables</h1>
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
          {session.name()}
        </span>
      </header>
      <div className="grid grid-cols-2 gap-3 px-4">
        {(tablesQuery.data ?? []).map((table) => {
          const order = orders.find((o) => o.table_id === table.id);
          const status = order ? orderKitchenStatus(order) : null;
          const items = order?.order_items.reduce((n, l) => n + l.quantity, 0) ?? 0;
          return (
            <button
              key={table.id}
              type="button"
              disabled={startOrder.isPending}
              onClick={() => (order ? onOpen(order.id) : startOrder.mutate(table.id))}
              className={[
                "flex h-32 flex-col justify-between rounded-2xl border-2 p-4 text-left shadow-sm transition active:scale-[0.98]",
                status === "ready"
                  ? "animate-pulse border-emerald-500 bg-emerald-50"
                  : order
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card",
              ].join(" ")}
            >
              <span className="text-3xl font-extrabold">{table.label}</span>
              <span className="text-sm font-semibold">
                {status === "ready" ? (
                  <span className="text-emerald-700">Ready to serve</span>
                ) : order ? (
                  <span className="text-primary">
                    {items} item{items === 1 ? "" : "s"}
                    {status === "unsent" ? " · not sent" : status === "cooking" ? " · cooking" : ""}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Free</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {tablesQuery.isLoading && (
        <p className="p-6 text-center text-muted-foreground">Loading tables…</p>
      )}
    </>
  );
}

// ---------- taking an order ----------

/** Taps made while offline, kept on the phone until the counter is reachable again. */
function usePendingTaps(orderId: string) {
  const key = `kasuri-pending-${orderId}`;
  const [pending, setPending] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (pending.length) localStorage.setItem(key, JSON.stringify(pending));
    else localStorage.removeItem(key);
  }, [key, pending]);
  return [pending, setPending] as const;
}

function OrderScreen({
  orderId,
  connected,
  onBack,
  onUnpaired,
}: {
  orderId: string;
  connected: boolean;
  onBack: () => void;
  onUnpaired: (r?: string) => void;
}) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<string | null>(null);
  /** Finds dishes by name across every category. */
  const [search, setSearch] = useState("");
  const [pending, setPending] = usePendingTaps(orderId);
  const [flushing, setFlushing] = useState(false);

  const orderQuery = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.get<Order>(`/orders/${orderId}`),
  });
  const linesQuery = useQuery({
    queryKey: ["order-items", orderId],
    queryFn: () => api.get<Line[]>(`/orders/${orderId}/items`),
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  });
  const menuQuery = useQuery({
    queryKey: ["menu-items"],
    queryFn: () => api.get<MenuItem[]>("/menu-items"),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["order-items", orderId] });
    queryClient.invalidateQueries({ queryKey: ["open-orders"] });
  };
  const fail = (e: unknown) =>
    e instanceof NotPairedError ? onUnpaired(e.message) : toast.error(errorText(e));

  const addItem = useMutation({
    mutationFn: (tap: { id: string; portion: Portion }) =>
      api.post(`/orders/${orderId}/items`, { menu_item_id: tap.id, portion: tap.portion }),
    onSuccess: refresh,
    onError: (e, tap) => {
      if (e instanceof OfflineError) setPending((p) => [...p, tapKey(tap.id, tap.portion)]);
      else fail(e);
    },
  });

  const changeQty = useMutation({
    mutationFn: (input: { id: string; quantity: number }) =>
      api.patch(`/order-items/${input.id}`, { quantity: input.quantity }),
    onSuccess: refresh,
    onError: fail,
  });

  const sendToKitchen = useMutation({
    mutationFn: () => api.post<{ kot_number: number }>(`/orders/${orderId}/send-to-kitchen`),
    onSuccess: (kot) => {
      refresh();
      toast.success(`Sent to kitchen · KOT #${kot.kot_number}`);
      onBack();
    },
    onError: fail,
  });

  const markServed = useMutation({
    mutationFn: () => api.post(`/orders/${orderId}/acknowledge-ready`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["open-orders"] });
      toast.success("Marked as served");
    },
    onError: fail,
  });

  // Once back online, send the taps that were saved while offline, in order.
  useEffect(() => {
    if (!connected || pending.length === 0 || flushing) return;
    setFlushing(true);
    (async () => {
      let sent = 0;
      for (const tap of pending) {
        try {
          const { id, portion } = parseTap(tap);
          await api.post(`/orders/${orderId}/items`, { menu_item_id: id, portion });
          sent++;
        } catch (e) {
          if (e instanceof OfflineError) break;
          sent++; // e.g. item no longer available: drop it, but say so
          toast.error(errorText(e));
        }
      }
      setPending((p) => p.slice(sent));
      setFlushing(false);
      refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, pending.length]);

  const categories = categoriesQuery.data ?? [];
  const activeCategory = category ?? categories[0]?.id ?? null;
  const menu = menuQuery.data ?? [];
  // Every word typed must appear in the name ("pan chil" → Paneer Chilli), across all categories.
  const searchWords = search.toLowerCase().split(/\s+/).filter(Boolean);
  const shownMenu = searchWords.length
    ? menu.filter((m) => searchWords.every((w) => m.name.toLowerCase().includes(w)))
    : menu.filter((m) => m.category_id === activeCategory);
  const lines = linesQuery.data ?? [];
  const sent = lines.filter((l) => l.kitchen_sent_at);
  const unsent = lines.filter((l) => !l.kitchen_sent_at);
  const unsentCount = unsent.reduce((n, l) => n + l.quantity, 0);
  const menuName = (id: string) => menu.find((m) => m.id === id)?.name ?? "Item";

  const pendingCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const tap of pending) {
      const { id } = parseTap(tap);
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [pending]);

  const order = orderQuery.data;
  if (order && order.status !== "OPEN") {
    return (
      <main className="space-y-4 p-6 text-center">
        <p className="text-lg font-semibold">This bill was closed at the counter.</p>
        <Button className="h-12" onClick={onBack}>
          Back to tables
        </Button>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          onClick={onBack}
          aria-label="Back to tables"
        >
          <ArrowLeft className="size-6" />
        </Button>
        <div>
          <h1 className="text-xl font-extrabold">
            {order?.restaurant_tables?.label ? `Table ${order.restaurant_tables.label}` : "Order"}
          </h1>
          {order && <p className="text-xs text-muted-foreground">Bill #{order.bill_number}</p>}
        </div>
      </header>

      {/* Menu: search, then category chips */}
      <div className="sticky top-[69px] z-10 mt-2 space-y-2 bg-background px-4 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a dish"
            aria-label="Find a dish"
            className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-10 text-base outline-none focus:border-primary"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground"
            >
              <X className="size-5" />
            </button>
          )}
        </div>
        {!searchWords.length && (
          <nav className="flex gap-2 overflow-x-auto">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={[
                  "h-11 shrink-0 rounded-full border px-4 font-semibold",
                  c.id === activeCategory
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card",
                ].join(" ")}
              >
                {c.name}
              </button>
            ))}
          </nav>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 pt-2">
        {shownMenu.map((m) => {
          const inOrder =
            unsent.filter((l) => l.menu_item_id === m.id).reduce((n, l) => n + l.quantity, 0) +
            (pendingCounts.get(m.id) ?? 0);
          const badge = inOrder > 0 && (
            <span className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {inOrder}
            </span>
          );
          return m.half_price == null ? (
            <button
              key={m.id}
              type="button"
              onClick={() => addItem.mutate({ id: m.id, portion: "full" })}
              className="relative flex min-h-24 flex-col justify-between rounded-xl border border-border bg-card p-3 text-left shadow-sm active:scale-[0.97] active:bg-primary/10"
            >
              <span className="font-semibold leading-tight">{m.name}</span>
              <span className="text-sm text-muted-foreground">{inr(m.price)}</span>
              {badge}
            </button>
          ) : (
            // Sold in two sizes: tap Full or Half.
            <div
              key={m.id}
              className="relative flex min-h-24 flex-col justify-between gap-2 rounded-xl border border-border bg-card p-2 shadow-sm"
            >
              <span className="px-1 font-semibold leading-tight">{m.name}</span>
              <div className="grid grid-cols-2 gap-1.5">
                {(["full", "half"] as const).map((portion) => (
                  <button
                    key={portion}
                    type="button"
                    onClick={() => addItem.mutate({ id: m.id, portion })}
                    className="rounded-lg border border-border px-1.5 py-1.5 text-left active:scale-[0.97] active:bg-primary/10"
                  >
                    <span className="block text-[11px] font-bold uppercase text-muted-foreground">
                      {portion}
                    </span>
                    <span className="text-sm font-semibold">
                      {inr(portion === "half" ? m.half_price! : m.price)}
                    </span>
                  </button>
                ))}
              </div>
              {badge}
            </div>
          );
        })}
        {searchWords.length > 0 && shownMenu.length === 0 && (
          <p className="col-span-2 py-6 text-center text-muted-foreground">
            No dish matches "{search}".
          </p>
        )}
      </div>

      {/* Current order — below the menu so dishes never move under the waiter's finger as items are added */}
      <section className="space-y-2 px-4 pt-6">
        {sent.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <ChefHat className="size-4" /> In the kitchen
            </p>
            {sent.map((l) => (
              <p key={l.id} className="flex justify-between py-0.5 text-muted-foreground">
                <span>{l.item_name}</span>
                <span className="font-semibold">× {l.quantity}</span>
              </p>
            ))}
          </div>
        )}

        {(unsent.length > 0 || pending.length > 0) && (
          <div className="rounded-xl border-2 border-primary/40 p-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-primary">
              New — not sent yet
            </p>
            {unsent.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 py-1">
                <span className="font-semibold">{l.item_name}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-10"
                    disabled={changeQty.isPending}
                    onClick={() => changeQty.mutate({ id: l.id, quantity: l.quantity - 1 })}
                    aria-label={`One less ${l.item_name}`}
                  >
                    <Minus className="size-4" />
                  </Button>
                  <span className="w-6 text-center text-lg font-bold">{l.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-10"
                    disabled={changeQty.isPending}
                    onClick={() => changeQty.mutate({ id: l.id, quantity: l.quantity + 1 })}
                    aria-label={`One more ${l.item_name}`}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {[...pendingCounts].map(([id, n]) => (
              <p key={id} className="flex justify-between py-1 text-amber-800">
                <span>{menuName(id)}</span>
                <span className="text-sm font-semibold">× {n} · waiting for Wi-Fi</span>
              </p>
            ))}
          </div>
        )}

        {lines.length === 0 && pending.length === 0 && !linesQuery.isLoading && (
          <p className="py-2 text-center text-muted-foreground">Tap dishes above to add them.</p>
        )}
      </section>

      {/* Send */}
      <div className={order?.kitchen_ready_at ? "h-24" : "h-2"} />
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        {/* Shown here, not at the top, so nothing on screen jumps when the kitchen finishes */}
        {order?.kitchen_ready_at && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 p-3">
            <p className="font-bold text-emerald-800">Food is ready to serve</p>
            <Button
              className="h-11 bg-emerald-600 hover:bg-emerald-700"
              disabled={markServed.isPending}
              onClick={() => markServed.mutate()}
            >
              <Check className="mr-1 size-4" /> Served
            </Button>
          </div>
        )}
        <Button
          className="h-16 w-full text-xl font-bold"
          disabled={
            !connected || unsentCount === 0 || pending.length > 0 || sendToKitchen.isPending
          }
          onClick={() => sendToKitchen.mutate()}
        >
          <ChefHat className="mr-2 size-6" />
          {pending.length > 0
            ? "Waiting for Wi-Fi…"
            : unsentCount > 0
              ? `Send to kitchen (${unsentCount})`
              : "Nothing new to send"}
        </Button>
      </div>
    </>
  );
}
