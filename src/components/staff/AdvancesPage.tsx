import { HandCoins, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import type { AdjustmentType, Employee } from "@/lib/staff-types";
import { staffApi, useLoad } from "@/lib/staff-api";
import { confirmAction } from "./desktop";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  MonthPicker,
  PageHeader,
  Stat,
} from "./ui";
import { dateLabel, monthLabel, thisMonth, today, useMoney, useSettings } from "./format";

export const ADJ_TYPES: Record<
  AdjustmentType,
  { label: string; tone: "amber" | "green" | "red"; help: string }
> = {
  advance: {
    label: "Advance",
    tone: "amber",
    help: "Money given before salary day. Cut from that month’s salary.",
  },
  bonus: {
    label: "Bonus",
    tone: "green",
    help: "Extra money added to salary (festival bonus, tips share, reward).",
  },
  deduction: {
    label: "Deduction",
    tone: "red",
    help: "Any other cut, e.g. breakage, fine, or food charges.",
  },
};

export default function AdvancesPage() {
  const [month, setMonth] = useState(thisMonth());
  const { data, error, reload } = useLoad(async () => {
    const [employees, adjustments] = await Promise.all([
      staffApi.employees(),
      staffApi.adjustmentsForMonth(month),
    ]);
    return { employees, adjustments };
  }, [month]);
  const [adding, setAdding] = useState<AdjustmentType | null>(null);
  const money = useMoney();

  const nameOf = (id: number) => data?.employees.find((e) => e.id === id)?.name ?? "Unknown";
  const sum = (t: AdjustmentType) =>
    (data?.adjustments ?? []).filter((a) => a.type === t).reduce((s, a) => s + a.amount, 0);

  async function remove(id: number) {
    if (
      !(await confirmAction(
        "Delete this entry? It will no longer be counted in the salary.",
        "Delete entry",
        "Delete",
      ))
    )
      return;
    await staffApi.deleteAdjustment(id);
    reload();
  }

  return (
    <>
      <PageHeader
        title="Advances & bonuses"
        subtitle="Entries are automatically adjusted in the salary for the month they are dated in."
        actions={<MonthPicker month={month} onChange={setMonth} />}
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(Object.keys(ADJ_TYPES) as AdjustmentType[]).map((t) => (
          <button key={t} onClick={() => setAdding(t)} className="cursor-pointer text-left">
            <Stat
              label={`${ADJ_TYPES[t].label}s this month`}
              value={money(sum(t))}
              icon={<Plus size={20} />}
              hint={
                <span className="font-medium text-primary">
                  + Add {ADJ_TYPES[t].label.toLowerCase()}
                </span>
              }
            />
          </button>
        ))}
      </div>

      {error && <ErrorBox message={error} />}
      {!data ? (
        <Loading />
      ) : data.adjustments.length === 0 ? (
        <Empty
          icon={<HandCoins size={48} />}
          title={`No advances or bonuses in ${monthLabel(month)}`}
        >
          <Button className="mt-2" onClick={() => setAdding("advance")}>
            <Plus size={18} /> Give an advance
          </Button>
        </Empty>
      ) : (
        <Card className="divide-y divide-border">
          {data.adjustments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={nameOf(a.employee_id)} id={a.employee_id} size="sm" />
              <div className="min-w-0 flex-1">
                <Link
                  to="/staff/people/$id"
                  params={{ id: String(a.employee_id) }}
                  className="font-semibold hover:text-primary"
                >
                  {nameOf(a.employee_id)}
                </Link>
                <div className="truncate text-sm text-muted-foreground">
                  {dateLabel(a.date)}
                  {a.note && ` · ${a.note}`}
                </div>
              </div>
              <Badge tone={ADJ_TYPES[a.type].tone}>{ADJ_TYPES[a.type].label}</Badge>
              <div className="w-24 text-right font-semibold">
                {a.type === "bonus" ? "+" : "−"}
                {money(a.amount)}
              </div>
              <button
                onClick={() => remove(a.id)}
                className="cursor-pointer rounded p-1.5 text-muted-foreground/60 hover:bg-red-50 hover:text-red-600"
                aria-label="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </Card>
      )}

      {adding && data && (
        <AdjustmentForm
          type={adding}
          employees={data.employees.filter((e) => e.active)}
          defaultDate={month === thisMonth() ? today() : `${month}-01`}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            reload();
          }}
        />
      )}
    </>
  );
}

export function AdjustmentForm({
  type: initialType,
  employees,
  employeeId,
  defaultDate,
  onClose,
  onSaved,
}: {
  type: AdjustmentType;
  employees: Employee[];
  employeeId?: number;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { settings } = useSettings();
  const [type, setType] = useState(initialType);
  const [emp, setEmp] = useState(String(employeeId ?? ""));
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await staffApi.addAdjustment({
        employee_id: Number(emp),
        type,
        amount: Number(amount),
        date,
        note,
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal title={`Add ${ADJ_TYPES[type].label.toLowerCase()}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBox message={error} />}
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {(Object.keys(ADJ_TYPES) as AdjustmentType[]).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setType(t)}
              className={`cursor-pointer rounded-md py-2 text-sm font-medium ${type === t ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              {ADJ_TYPES[t].label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{ADJ_TYPES[type].help}</p>
        {employeeId === undefined && (
          <Field label="Staff member">
            <select
              className="w-full"
              value={emp}
              onChange={(e) => setEmp(e.target.value)}
              required
            >
              <option value="">Choose…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.role ? ` (${e.role})` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Amount (${settings.currency_symbol})`}>
            <input
              type="number"
              min="1"
              step="any"
              inputMode="decimal"
              className="w-full"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              required
            />
          </Field>
          <Field label="Date">
            <input
              type="date"
              className="w-full"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
        </div>
        <Field label="Note (optional)">
          <input
            className="w-full"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Diwali bonus, medical emergency"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
