import { AlertTriangle, Check, ChevronDown, Download, FileText, Undo2, Wallet } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { PayrollLine } from "@/lib/staff-types";
import { staffApi, useLoad, type PayrollEntry } from "@/lib/staff-api";
import {
  Avatar,
  Button,
  Card,
  cx,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  MonthPicker,
  PageHeader,
} from "./ui";
import { confirmAction, saveTextFile } from "./desktop";
import { dateLabel, fmtNum, monthLabel, thisMonth, toCSV, today, useMoney } from "./format";

export const PAY_METHODS = ["Cash", "UPI", "Bank transfer", "Cheque"];

type Filter = "all" | "unpaid" | "paid";

export default function PayrollPage() {
  const [month, setMonth] = useState(thisMonth());
  const { data, error, reload } = useLoad(() => staffApi.payroll(month), [month]);
  const [paying, setPaying] = useState<PayrollEntry | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);
  const money = useMoney();

  const entries = data ?? [];
  const total = entries.reduce((s, p) => s + p.line.net_pay, 0);
  const paidEntries = entries.filter((p) => p.payment);
  const unpaidEntries = entries.filter((p) => !p.payment);
  const paidAmount = paidEntries.reduce((s, p) => s + (p.payment?.amount ?? 0), 0);
  const leftToPay = unpaidEntries.reduce((s, p) => s + p.line.net_pay, 0);
  const leaveCuts = entries.reduce((s, p) => s + p.line.leave_deduction, 0);
  const inProgress = month >= thisMonth();
  const shown = filter === "paid" ? paidEntries : filter === "unpaid" ? unpaidEntries : entries;

  async function undo(p: PayrollEntry) {
    if (
      !p.payment ||
      !(await confirmAction(
        `Undo the payment to ${p.line.name}? The salary will be recalculated from current data.`,
        "Undo payment",
        "Undo payment",
      ))
    )
      return;
    await staffApi.undoPayment(p.payment.id);
    reload();
  }

  function exportCSV() {
    if (!data) return;
    const rows: (string | number)[][] = [
      [
        "Name",
        "Role",
        "Monthly salary",
        "Days worked basis",
        "Leaves taken",
        "Allowed",
        "Extra leaves",
        "Leave deduction",
        "Overtime pay",
        "Bonus",
        "Advance",
        "Other deduction",
        "Net pay",
        "Status",
        "Paid on",
        "Method",
      ],
      ...data.map(({ line: l, payment }) => [
        l.name,
        l.role,
        l.monthly_salary,
        `${l.eligible_days}/${l.days_in_month}`,
        l.leaves_taken,
        l.allowed_leaves,
        l.extra_leaves,
        l.leave_deduction,
        l.overtime_pay,
        l.bonus,
        l.advance,
        l.other_deduction,
        l.net_pay,
        payment ? "Paid" : "Unpaid",
        payment?.paid_on ?? "",
        payment?.method ?? "",
      ]),
    ];
    saveTextFile(`salary-${month}.csv`, toCSV(rows), { name: "Spreadsheet (CSV)", ext: "csv" });
  }

  return (
    <>
      <PageHeader
        title="Salary"
        subtitle={
          inProgress
            ? `${monthLabel(month)} is still running. Amounts assume full attendance for the remaining days.`
            : `Salaries for ${monthLabel(month)}`
        }
        actions={
          <>
            <MonthPicker month={month} onChange={setMonth} />
            <Button
              variant="secondary"
              onClick={exportCSV}
              disabled={!entries.length}
              title="Export to Excel (CSV)"
            >
              <Download size={18} /> Export
            </Button>
          </>
        }
      />

      {error && <ErrorBox message={error} />}
      {!data ? (
        <Loading />
      ) : entries.length === 0 ? (
        <Empty
          icon={<Wallet size={48} />}
          title={`Nobody on the payroll for ${monthLabel(month)}`}
        />
      ) : (
        <>
          {/* Summary */}
          <Card className="mb-5 p-5">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <div>
                <div className="text-sm text-muted-foreground">Total salary this month</div>
                <div className="text-3xl font-bold text-foreground">{money(total)}</div>
              </div>
              <div className="flex gap-8 text-sm">
                <div>
                  <div className="text-muted-foreground">Paid</div>
                  <div className="text-lg font-semibold text-emerald-700">{money(paidAmount)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Left to pay</div>
                  <div className="text-lg font-semibold text-foreground">{money(leftToPay)}</div>
                </div>
                {leaveCuts > 0 && (
                  <div>
                    <div className="text-muted-foreground">Leave cuts</div>
                    <div className="text-lg font-semibold text-red-600">{money(leaveCuts)}</div>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${(paidEntries.length / entries.length) * 100}%` }}
              />
            </div>
            <div className="mt-1.5 text-sm text-muted-foreground">
              {paidEntries.length} of {entries.length} people paid
            </div>
          </Card>

          {/* Filter tabs */}
          <div className="mb-3 inline-flex rounded-lg bg-muted/60 p-1 text-sm font-medium">
            {(
              [
                ["all", "Everyone", entries.length],
                ["unpaid", "To pay", unpaidEntries.length],
                ["paid", "Paid", paidEntries.length],
              ] as const
            ).map(([key, label, n]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cx(
                  "cursor-pointer rounded-md px-3 py-1.5",
                  filter === key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label} <span className="text-muted-foreground/60">{n}</span>
              </button>
            ))}
          </div>

          <Card className="divide-y divide-border overflow-hidden">
            {shown.length === 0 && (
              <div className="px-5 py-10 text-center text-muted-foreground">
                {filter === "paid" ? "Nobody paid yet." : "Everyone has been paid. 🎉"}
              </div>
            )}
            {shown.map((p) => {
              const l = p.line;
              const isOpen = open === l.employee_id;
              const changed = !!p.payment && p.live.net_pay !== l.net_pay;
              const toggle = () => setOpen(isOpen ? null : l.employee_id);
              return (
                <div key={l.employee_id} className={cx(isOpen && "bg-muted/70")}>
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[auto_1fr_auto_9rem] sm:gap-x-4 sm:px-5">
                    <button
                      onClick={toggle}
                      className="cursor-pointer self-start sm:self-center"
                      tabIndex={-1}
                      aria-hidden
                    >
                      <Avatar name={l.name} id={l.employee_id} />
                    </button>
                    <button
                      onClick={toggle}
                      className="min-w-0 cursor-pointer text-left"
                      aria-expanded={isOpen}
                    >
                      <div className="truncate font-semibold text-foreground">{l.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <Tags line={l} />
                      </div>
                    </button>
                    <button
                      onClick={toggle}
                      className="flex cursor-pointer items-center gap-1 self-start sm:self-center"
                      tabIndex={-1}
                    >
                      <span className="text-lg font-bold whitespace-nowrap text-foreground">
                        {money(l.net_pay)}
                      </span>
                      <ChevronDown
                        size={16}
                        className={cx(
                          "text-muted-foreground/60 transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>
                    <div className="col-span-2 col-start-2 justify-self-end sm:col-span-1 sm:col-start-auto">
                      {p.payment ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap text-emerald-700">
                          {changed ? (
                            <span
                              title={`Attendance or advances changed after paying. It would now be ${money(p.live.net_pay)}. Undo the payment to recalculate.`}
                            >
                              <AlertTriangle size={16} className="text-amber-500" />
                            </span>
                          ) : (
                            <Check size={16} />
                          )}
                          Paid {dateLabel(p.payment.paid_on, { day: "numeric", month: "short" })}
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setPaying(p)}>
                          Mark paid
                        </Button>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="px-4 pb-4 pl-[4.25rem] sm:pr-5 sm:pl-[4.75rem]">
                      <Breakdown line={l} />
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Link
                          to="/staff/salary/$month/$employeeId"
                          params={{ month: month, employeeId: String(l.employee_id) }}
                        >
                          <Button size="sm" variant="secondary">
                            <FileText size={16} /> Salary slip
                          </Button>
                        </Link>
                        {p.payment && (
                          <>
                            <span className="text-sm text-muted-foreground">
                              Paid {money(p.payment.amount)} by {p.payment.method} on{" "}
                              {dateLabel(p.payment.paid_on)}
                              {p.payment.note && ` · ${p.payment.note}`}
                            </span>
                            <Button size="sm" variant="ghost" onClick={() => undo(p)}>
                              <Undo2 size={16} /> Undo payment
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </>
      )}

      {paying && (
        <PayModal
          entry={paying}
          month={month}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function Tag({
  tone,
  children,
}: {
  tone: "stone" | "red" | "green" | "amber";
  children: ReactNode;
}) {
  const tones = {
    stone: "bg-muted text-muted-foreground",
    red: "bg-red-50 text-red-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
  };
  return (
    <span
      className={cx("rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone])}
    >
      {children}
    </span>
  );
}

/** Short, plain-language notes about what affected this person's salary. */
function Tags({ line: l }: { line: PayrollLine }) {
  const money = useMoney();
  const tags: ReactNode[] = [];
  if (l.role)
    tags.push(
      <span key="role" className="text-xs text-muted-foreground">
        {l.role}
      </span>,
    );
  tags.push(
    <Tag key="leaves" tone="stone">
      {fmtNum(l.leaves_taken)} of {fmtNum(l.allowed_leaves)} leaves
    </Tag>,
  );
  if (l.extra_leaves > 0)
    tags.push(
      <Tag key="extra" tone="red">
        {fmtNum(l.extra_leaves)} extra leave{l.extra_leaves === 1 ? "" : "s"}
      </Tag>,
    );
  if (l.advance > 0)
    tags.push(
      <Tag key="adv" tone="amber">
        Advance {money(l.advance)}
      </Tag>,
    );
  if (l.overtime_pay > 0)
    tags.push(
      <Tag key="ot" tone="green">
        Overtime {money(l.overtime_pay)}
      </Tag>,
    );
  if (l.bonus > 0)
    tags.push(
      <Tag key="bonus" tone="green">
        Bonus {money(l.bonus)}
      </Tag>,
    );
  if (l.eligible_days < l.days_in_month)
    tags.push(
      <Tag key="join" tone="stone">
        Joined mid-month
      </Tag>,
    );
  return <>{tags}</>;
}

/** Step-by-step calculation: salary, then each addition and cut, then the final amount. */
function Breakdown({ line: l }: { line: PayrollLine }) {
  const money = useMoney();
  const rows: [string, number, string?][] = [
    [
      l.eligible_days < l.days_in_month
        ? `Salary for ${l.eligible_days} of ${l.days_in_month} days`
        : "Monthly salary",
      l.base_pay,
    ],
    [
      `Extra leaves (${fmtNum(l.extra_leaves)} × ${money(l.per_day_rate, true)})`,
      -l.leave_deduction,
    ],
    [`Unused leaves (${fmtNum(l.unused_leaves)} days)`, l.unused_leave_pay],
    [`Overtime (${fmtNum(l.overtime_hours)} hrs)`, l.overtime_pay],
    ["Bonus", l.bonus],
    ["Advance taken", -l.advance],
    ["Other deductions", -l.other_deduction],
  ];
  return (
    <div className="max-w-md rounded-lg border border-border bg-card text-sm">
      {rows
        .filter(([, v], i) => i === 0 || v !== 0)
        .map(([label, v], i) => (
          <div key={label} className="flex justify-between px-3 py-1.5">
            <span className="text-muted-foreground">{label}</span>
            <span
              className={cx("font-medium", i > 0 && (v < 0 ? "text-red-600" : "text-emerald-700"))}
            >
              {i > 0 && (v < 0 ? "− " : "+ ")}
              {money(Math.abs(v))}
            </span>
          </div>
        ))}
      <div className="flex justify-between border-t border-border px-3 py-2 font-semibold">
        <span>To pay</span>
        <span>{money(l.net_pay)}</span>
      </div>
    </div>
  );
}

export function PayModal({
  entry,
  month,
  onClose,
  onDone,
}: {
  entry: PayrollEntry;
  month: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const money = useMoney();
  const [amount, setAmount] = useState(String(entry.live.net_pay));
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await staffApi.pay({
        employee_id: entry.line.employee_id,
        month,
        amount: Number(amount),
        paid_on: paidOn,
        method,
        note,
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal title={`Pay ${entry.line.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBox message={error} />}
        <div className="rounded-lg bg-primary/10 p-4 text-center">
          <div className="text-sm text-muted-foreground">Salary for {monthLabel(month)}</div>
          <div className="text-3xl font-bold text-primary">{money(entry.live.net_pay)}</div>
        </div>
        <Field label="Amount paid" hint="Change only if you are paying a different amount">
          <input
            type="number"
            min="0"
            step="any"
            className="w-full"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid on">
            <input
              type="date"
              className="w-full"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              required
            />
          </Field>
          <Field label="Paid by">
            <select className="w-full" value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAY_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Note (optional)">
          <input className="w-full" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Confirm payment</Button>
        </div>
      </form>
    </Modal>
  );
}
