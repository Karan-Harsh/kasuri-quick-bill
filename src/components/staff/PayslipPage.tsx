import { ArrowLeft, Printer } from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { staffApi, useLoad } from "@/lib/staff-api";
import { Badge, Button, Card, ErrorBox, Loading } from "./ui";
import { dateLabel, fmtNum, monthLabel, useMoney, useSettings } from "./format";
import { PayModal } from "./SalaryPage";

export default function PayslipPage({ month, employeeId }: { month: string; employeeId: string }) {
  const { data, error, reload } = useLoad(() => staffApi.payroll(month), [month]);
  const { settings } = useSettings();
  const money = useMoney();
  const [paying, setPaying] = useState(false);

  const entry = data?.find((p) => p.line.employee_id === Number(employeeId));
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  if (!entry) return <ErrorBox message="This employee is not on the payroll for this month." />;

  const l = entry.line;
  const earnings: [string, number, (string | undefined)?][] = [
    [
      "Basic salary",
      l.base_pay,
      l.eligible_days < l.days_in_month
        ? `${l.eligible_days} of ${l.days_in_month} days`
        : undefined,
    ],
    [
      "Overtime",
      l.overtime_pay,
      l.overtime_hours ? `${fmtNum(l.overtime_hours)} hours` : undefined,
    ],
    [
      "Unused leave pay",
      l.unused_leave_pay,
      l.unused_leave_pay ? `${fmtNum(l.unused_leaves)} days` : undefined,
    ],
    ["Bonus", l.bonus],
  ];
  const deductions: [string, number, (string | undefined)?][] = [
    [
      "Extra leave",
      l.leave_deduction,
      l.extra_leaves
        ? `${fmtNum(l.extra_leaves)} days × ${money(l.per_day_rate, true)}`
        : undefined,
    ],
    ["Advance taken", l.advance],
    ["Other deductions", l.other_deduction],
  ];
  const totalEarn = earnings.reduce((s, [, v]) => s + v, 0);
  const totalDed = deductions.reduce((s, [, v]) => s + v, 0);

  const Row = ([label, value, hint]: [string, number, (string | undefined)?]) => (
    <div key={label} className="flex justify-between py-2">
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span className="font-medium">{money(value, true)}</span>
    </div>
  );

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/staff/salary"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={18} /> Back to salary
        </Link>
        <div className="flex gap-2">
          {!entry.payment && <Button onClick={() => setPaying(true)}>Mark paid</Button>}
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={18} /> Print / Save PDF
          </Button>
        </div>
      </div>

      <Card className="mx-auto max-w-2xl p-6 sm:p-8 print:border-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="text-xl font-bold">{settings.restaurant_name}</div>
            <div className="text-muted-foreground">Salary slip · {monthLabel(month)}</div>
          </div>
          {entry.payment ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Not paid</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-y-2 border-b border-border py-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Name</div>
            <div className="font-semibold">{l.name}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Role</div>
            <div className="font-semibold">{l.role || "–"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Monthly salary</div>
            <div className="font-semibold">{money(l.monthly_salary)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Per day</div>
            <div className="font-semibold">{money(l.per_day_rate, true)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-2 border-b border-border py-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Absent</div>
            <div className="font-semibold">{l.absent_days}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Half days</div>
            <div className="font-semibold">{l.half_days}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Leaves taken / allowed</div>
            <div className="font-semibold">
              {fmtNum(l.leaves_taken)} / {fmtNum(l.allowed_leaves)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Paid leave</div>
            <div className="font-semibold">{l.paid_leave_days}</div>
          </div>
        </div>

        <div className="grid gap-6 py-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 font-semibold text-emerald-700">Earnings</div>
            <div className="divide-y divide-border text-sm">
              {earnings.filter(([, v], i) => v || i === 0).map(Row)}
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-2 font-semibold">
              <span>Total</span>
              <span>{money(totalEarn, true)}</span>
            </div>
          </div>
          <div>
            <div className="mb-1 font-semibold text-red-700">Deductions</div>
            <div className="divide-y divide-border text-sm">
              {deductions.filter(([, v]) => v).map(Row)}
              {totalDed === 0 && <div className="py-2 text-muted-foreground/60">None</div>}
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-2 font-semibold">
              <span>Total</span>
              <span>{money(totalDed, true)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-primary/10 px-4 py-4">
          <span className="font-semibold">Net salary</span>
          <span className="text-2xl font-bold text-primary">{money(l.net_pay)}</span>
        </div>

        {entry.payment && (
          <div className="mt-4 text-sm text-muted-foreground">
            Paid {money(entry.payment.amount)} on {dateLabel(entry.payment.paid_on)} by{" "}
            {entry.payment.method}
            {entry.payment.note && ` · ${entry.payment.note}`}
          </div>
        )}

        <div className="mt-12 grid grid-cols-2 gap-8 text-center text-sm text-muted-foreground">
          <div className="border-t border-border pt-2">Employee signature</div>
          <div className="border-t border-border pt-2">Authorised signature</div>
        </div>
      </Card>

      {paying && (
        <PayModal
          entry={entry}
          month={month}
          onClose={() => setPaying(false)}
          onDone={() => {
            setPaying(false);
            reload();
          }}
        />
      )}
    </>
  );
}
