import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { inr } from "@/lib/kasuri";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/accounts")({
  head: () => ({ meta: [{ title: "Accounts — Kasuri" }] }),
  component: AccountsPage,
});

interface Totals {
  bills: number;
  sales: number;
  gst: number;
  ingredients: number;
  unpricedDeliveries: number;
  salaries: number;
  salariesEstimated: boolean;
  expenses: number;
  expensesByCategory: Record<string, number>;
  profit: number;
}
interface ProfitAndLoss {
  months: (Totals & { month: string })[];
  total: Totals;
}
interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  note: string | null;
}

type Preset = "this" | "last" | "quarter" | "year" | "custom";

const pad = (n: number) => String(n).padStart(2, "0");
const monthOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const today = () => new Date().toLocaleDateString("en-CA");

function presetMonths(preset: Exclude<Preset, "custom">) {
  const now = new Date();
  const back = (n: number) => monthOf(new Date(now.getFullYear(), now.getMonth() - n, 1));
  switch (preset) {
    case "this":
      return { from: back(0), to: back(0) };
    case "last":
      return { from: back(1), to: back(1) };
    case "quarter":
      return { from: back(2), to: back(0) };
    case "year":
      return { from: `${now.getFullYear()}-01`, to: back(0) };
  }
}

const monthLabel = (month: string, opts: Intl.DateTimeFormatOptions = { month: "long" }) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { ...opts, year: "numeric" });
};
const lastDayOf = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${month}-${pad(new Date(y, m, 0).getDate())}`;
};

const PRESETS: [Exclude<Preset, "custom">, string][] = [
  ["this", "This month"],
  ["last", "Last month"],
  ["quarter", "Last 3 months"],
  ["year", "This year"],
];

function AccountsPage() {
  const queryClient = useQueryClient();
  const [preset, setPreset] = useState<Preset>("this");
  const [range, setRange] = useState(presetMonths("this"));
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [form, setForm] = useState({ date: today(), category: "", amount: "", note: "" });

  const valid = range.from && range.to && range.from <= range.to;
  const pnl = useQuery({
    queryKey: ["accounts", "pnl", range.from, range.to],
    queryFn: () => api.get<ProfitAndLoss>(`/profit-and-loss?from=${range.from}&to=${range.to}`),
    enabled: Boolean(valid),
  });
  const expenses = useQuery({
    queryKey: ["accounts", "expenses", range.from, range.to],
    queryFn: () => api.get<Expense[]>(`/expenses?from=${range.from}-01&to=${lastDayOf(range.to)}`),
    enabled: Boolean(valid),
  });
  const categories = useQuery({
    queryKey: ["accounts", "categories"],
    queryFn: () => api.get<string[]>("/expenses/categories"),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["accounts"] });
  const addExpense = useMutation({
    mutationFn: () => api.post("/expenses", { ...form, amount: Number(form.amount) }),
    onSuccess: () => {
      refresh();
      toast.success(`${form.category} expense added`);
      setForm((f) => ({ ...f, amount: "", note: "" }));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add"),
  });
  const deleteExpense = useMutation({
    mutationFn: (id: string) => api.del(`/expenses/${id}`),
    onSuccess: () => {
      refresh();
      setDeleting(null);
      toast.success("Expense deleted");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete"),
  });

  const t = pnl.data?.total;
  const months = pnl.data?.months ?? [];
  const periodLabel =
    range.from === range.to
      ? monthLabel(range.from)
      : `${monthLabel(range.from, { month: "short" })} – ${monthLabel(range.to, { month: "short" })}`;
  const profit = t?.profit ?? 0;
  const estimatedMonth = months.find((m) => m.salariesEstimated)?.month;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-3xl font-bold">Accounts</h1>
          <p className="mt-1 text-muted-foreground">
            Profit and loss from sales, ingredients bought, salaries and running costs.
          </p>
        </div>

        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(([key, label]) => (
              <Button
                key={key}
                variant={preset === key ? "default" : "outline"}
                className="h-11 text-base"
                onClick={() => {
                  setPreset(key);
                  setRange(presetMonths(key));
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="fromMonth">From</Label>
              <Input
                id="fromMonth"
                type="month"
                value={range.from}
                className="h-11"
                onChange={(e) => {
                  setPreset("custom");
                  setRange((r) => ({ ...r, from: e.target.value }));
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="toMonth">To</Label>
              <Input
                id="toMonth"
                type="month"
                value={range.to}
                className="h-11"
                onChange={(e) => {
                  setPreset("custom");
                  setRange((r) => ({ ...r, to: e.target.value }));
                }}
              />
            </div>
          </div>
          {!valid && (
            <p className="text-sm text-destructive">
              The start month must be before the end month.
            </p>
          )}
          {pnl.isError && (
            <p className="text-sm text-destructive">
              {pnl.error instanceof Error ? pnl.error.message : "Could not load"}
            </p>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <Card className="space-y-5 p-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {profit < 0 ? "Loss" : "Profit"} · {periodLabel}
              </p>
              <p
                className={`mt-1 text-5xl font-extrabold ${
                  profit < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {t ? inr(Math.abs(profit)) : "—"}
              </p>
            </div>

            <div className="space-y-2 text-base">
              <PnlLine
                label="Sales"
                hint={`${t?.bills ?? 0} ${t?.bills === 1 ? "bill" : "bills"} · after discounts, before GST`}
                value={t?.sales}
                sign="+"
              />
              <PnlLine
                label="Ingredients bought"
                hint="Amount paid on stock received"
                value={t?.ingredients}
                sign="−"
              />
              <PnlLine
                label="Salaries"
                hint="What staff earned (advances included)"
                value={t?.salaries}
                sign="−"
              />
              <PnlLine label="Other expenses" value={t?.expenses} sign="−" />
              {t &&
                Object.entries(t.expensesByCategory).map(([category, amount]) => (
                  <div
                    key={category}
                    className="flex justify-between pl-4 text-sm text-muted-foreground"
                  >
                    <span>{category}</span>
                    <span>{inr(amount)}</span>
                  </div>
                ))}
              <div className="flex items-baseline justify-between border-t-2 border-foreground pt-3 text-xl font-extrabold">
                <span>{profit < 0 ? "Loss" : "Profit"}</span>
                <span className={profit < 0 ? "text-destructive" : ""}>
                  {t ? `${profit < 0 ? "−" : ""}${inr(Math.abs(profit))}` : "—"}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              {t && t.gst > 0 && (
                <p>
                  GST collected: {inr(t.gst)}. Not counted as income — it goes to the government.
                </p>
              )}
              {t && t.unpricedDeliveries > 0 && (
                <p className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {t.unpricedDeliveries} stock{" "}
                    {t.unpricedDeliveries === 1 ? "delivery has" : "deliveries have"} no amount
                    paid, so ingredient cost may be too low. Enter the amount when using{" "}
                    <Link to="/inventory" className="font-medium underline">
                      Inventory → Received
                    </Link>
                    .
                  </span>
                </p>
              )}
              {estimatedMonth && (
                <p>
                  {monthLabel(estimatedMonth)} is still running: its salaries assume full attendance
                  for the days left.
                </p>
              )}
            </div>

            {months.length > 1 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2">Month</th>
                      <th className="py-2 text-right">Sales</th>
                      <th className="py-2 text-right">Ingredients</th>
                      <th className="py-2 text-right">Salaries</th>
                      <th className="py-2 text-right">Expenses</th>
                      <th className="py-2 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => (
                      <tr key={m.month} className="border-b border-border/60">
                        <td className="py-2">{monthLabel(m.month, { month: "short" })}</td>
                        <td className="py-2 text-right">{inr(m.sales)}</td>
                        <td className="py-2 text-right">{inr(m.ingredients)}</td>
                        <td className="py-2 text-right">{inr(m.salaries)}</td>
                        <td className="py-2 text-right">{inr(m.expenses)}</td>
                        <td
                          className={`py-2 text-right font-semibold ${m.profit < 0 ? "text-destructive" : ""}`}
                        >
                          {m.profit < 0 ? "−" : ""}
                          {inr(Math.abs(m.profit))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="h-fit space-y-4 p-5">
            <h2 className="text-xl font-bold">Add an expense</h2>
            <p className="-mt-2 text-sm text-muted-foreground">
              Rent, electricity, gas, repairs… Stock bought goes in Inventory, salaries in Staff.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="expDate">Date</Label>
                <Input
                  id="expDate"
                  type="date"
                  value={form.date}
                  max={today()}
                  className="h-11"
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expAmount">Amount (₹)</Label>
                <Input
                  id="expAmount"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={form.amount}
                  className="h-11"
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="expCategory">Category</Label>
              <Input
                id="expCategory"
                list="expenseCategories"
                value={form.category}
                placeholder="e.g. Rent"
                className="h-11"
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
              <datalist id="expenseCategories">
                {(categories.data ?? []).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <div className="flex flex-wrap gap-1 pt-1">
                {(categories.data ?? []).slice(0, 6).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, category: c })}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${
                      form.category === c
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="expNote">Note (optional)</Label>
              <Input
                id="expNote"
                value={form.note}
                maxLength={200}
                placeholder="e.g. November rent"
                className="h-11"
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
            <Button
              className="h-11 w-full text-base"
              disabled={addExpense.isPending || !form.category.trim() || !(Number(form.amount) > 0)}
              onClick={() => addExpense.mutate()}
            >
              <Plus className="mr-2 size-5" /> Add expense
            </Button>
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="mb-3 text-xl font-bold">
            Expenses · {periodLabel}{" "}
            {t && <span className="text-muted-foreground">({inr(t.expenses)})</span>}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2">Date</th>
                  <th className="py-2">Category</th>
                  <th className="py-2">Note</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {(expenses.data ?? []).map((e) => (
                  <tr key={e.id} className="border-b border-border/60">
                    <td className="py-2 whitespace-nowrap">
                      {new Date(`${e.date}T00:00:00`).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </td>
                    <td className="py-2 font-medium">{e.category}</td>
                    <td className="py-2 text-muted-foreground">{e.note ?? "—"}</td>
                    <td className="py-2 text-right font-semibold">{inr(e.amount)}</td>
                    <td className="py-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-9 text-destructive"
                        aria-label={`Delete ${e.category} expense`}
                        onClick={() => setDeleting(e)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!expenses.isLoading && (expenses.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-muted-foreground">
                      No expenses in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && `${deleting.category}, ${inr(deleting.amount)}. `}It will no longer count
              in profit and loss.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
            <Button
              variant="destructive"
              className="h-11"
              disabled={deleteExpense.isPending}
              onClick={() => deleting && deleteExpense.mutate(deleting.id)}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PnlLine({
  label,
  hint,
  value,
  sign,
}: {
  label: string;
  hint?: string;
  value: number | undefined;
  sign: "+" | "−";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span className="font-semibold whitespace-nowrap">
        {value === undefined ? "—" : `${sign} ${inr(value)}`}
      </span>
    </div>
  );
}
