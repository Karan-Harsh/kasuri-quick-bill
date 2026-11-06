import { ArrowLeft, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { monthDates } from "@/lib/payroll";
import { STATUS_LABELS } from "@/lib/staff-types";
import { staffApi, useLoad } from "@/lib/staff-api";
import { confirmAction } from "./desktop";
import EmployeeForm from "./EmployeeForm";
import { Avatar, Badge, Button, Card, cx, ErrorBox, Loading, MonthPicker, statusStyle } from "./ui";
import { dateLabel, fmtNum, monthLabel, thisMonth, today, useMoney, weekday } from "./format";
import { ADJ_TYPES, AdjustmentForm } from "./AdvancesPage";

export default function EmployeeDetailPage({ id }: { id: number }) {
  const navigate = useNavigate();
  const money = useMoney();
  const [month, setMonth] = useState(thisMonth());
  const [editing, setEditing] = useState(false);
  const [addingAdj, setAddingAdj] = useState(false);

  const { data: emp, error, reload: reloadEmp } = useLoad(() => staffApi.employee(id), [id]);
  const { data: monthData, reload: reloadMonth } = useLoad(async () => {
    const [records, payroll] = await Promise.all([
      staffApi.attendanceForMonth(month),
      staffApi.payroll(month),
    ]);
    return {
      records: records.filter((r) => r.employee_id === id),
      line: payroll.find((p) => p.line.employee_id === id) ?? null,
    };
  }, [id, month]);
  const { data: history, reload: reloadHistory } = useLoad(async () => {
    const [adjustments, payments] = await Promise.all([
      staffApi.adjustmentsForEmployee(id),
      staffApi.paymentsForEmployee(id),
    ]);
    return { adjustments, payments };
  }, [id]);

  if (error) return <ErrorBox message={error} />;
  if (!emp) return <Loading />;

  async function remove() {
    if (!emp) return;
    if (
      !(await confirmAction(
        `Permanently delete ${emp.name} and ALL their attendance, advances and salary records?\n\nIf they just left, use “Edit” and untick “Currently working here” instead.`,
        "Delete staff member",
        "Delete permanently",
      ))
    )
      return;
    await staffApi.deleteEmployee(emp.id);
    navigate({ to: "/staff/people" });
  }

  const dates = monthDates(month);
  const firstWeekday = weekday(dates[0]!);
  const recordByDate = new Map((monthData?.records ?? []).map((r) => [r.date, r]));
  const line = monthData?.line?.line;

  return (
    <>
      <Link
        to="/staff/people"
        className="mb-4 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={18} /> All staff
      </Link>

      <Card className="mb-6 flex flex-wrap items-center gap-4 p-5">
        <Avatar name={emp.name} id={emp.id} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xl font-bold">
            {emp.name} {!emp.active && <Badge>Left</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-4 text-muted-foreground">
            {emp.role && <span>{emp.role}</span>}
            {emp.phone && (
              <a
                href={`tel:${emp.phone}`}
                className="inline-flex items-center gap-1 hover:text-primary"
              >
                <Phone size={14} /> {emp.phone}
              </a>
            )}
            <span>Joined {dateLabel(emp.join_date)}</span>
          </div>
          {emp.notes && (
            <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{emp.notes}</p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-sm text-muted-foreground">Salary</div>
            <div className="font-bold">{money(emp.monthly_salary)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Leaves/mo</div>
            <div className="font-bold">{fmtNum(emp.allowed_leaves)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">OT/hr</div>
            <div className="font-bold">{emp.overtime_rate ? money(emp.overtime_rate) : "–"}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil size={16} /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={remove} aria-label="Delete">
            <Trash2 size={16} />
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Attendance</h2>
            <MonthPicker month={month} onChange={setMonth} />
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1 font-medium text-muted-foreground">
                {d}
              </div>
            ))}
            {Array.from({ length: firstWeekday }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {dates.map((d) => {
              const r = recordByDate.get(d);
              const st = r?.status ?? "P";
              const inactive = d < emp.join_date || d > today();
              return (
                <div
                  key={d}
                  title={`${STATUS_LABELS[st]}${r?.note ? ` – ${r.note}` : ""}${r?.overtime_hours ? ` · OT ${r.overtime_hours}h` : ""}`}
                  className={cx(
                    "rounded-md py-2",
                    inactive ? "text-muted-foreground/60" : statusStyle[st].cell,
                  )}
                >
                  <div className="font-medium">{Number(d.slice(8))}</div>
                  {!inactive && st !== "P" && (
                    <div className="text-[10px]">
                      <span className="sm:hidden">{statusStyle[st].short}</span>
                      <span className="hidden sm:inline">{STATUS_LABELS[st]}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Link
            to="/staff/timesheet"
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
          >
            Edit in timesheet →
          </Link>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Salary for {monthLabel(month)}</h2>
          {!line ? (
            <p className="text-muted-foreground">Not on payroll this month.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Salary</span>
                <span>{money(line.base_pay)}</span>
              </div>
              <div className="flex justify-between">
                <span>Leaves taken</span>
                <span>
                  {fmtNum(line.leaves_taken)} of {fmtNum(line.allowed_leaves)} allowed
                </span>
              </div>
              {line.leave_deduction > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Extra leave cut ({fmtNum(line.extra_leaves)} days)</span>
                  <span>−{money(line.leave_deduction)}</span>
                </div>
              )}
              {line.overtime_pay > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Overtime</span>
                  <span>+{money(line.overtime_pay)}</span>
                </div>
              )}
              {line.unused_leave_pay > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Unused leave pay</span>
                  <span>+{money(line.unused_leave_pay)}</span>
                </div>
              )}
              {line.bonus > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Bonus</span>
                  <span>+{money(line.bonus)}</span>
                </div>
              )}
              {line.advance > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Advance</span>
                  <span>−{money(line.advance)}</span>
                </div>
              )}
              {line.other_deduction > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Other deductions</span>
                  <span>−{money(line.other_deduction)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>Net salary</span>
                <span>{money(line.net_pay)}</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                {monthData?.line?.payment ? (
                  <Badge tone="green">Paid</Badge>
                ) : (
                  <Badge tone="amber">Not paid yet</Badge>
                )}
                <Link
                  to="/staff/salary/$month/$employeeId"
                  params={{ month: month, employeeId: String(id) }}
                  className="font-medium text-primary hover:underline"
                >
                  Payslip →
                </Link>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Advances, bonuses & deductions</h2>
            <Button size="sm" variant="secondary" onClick={() => setAddingAdj(true)}>
              <Plus size={16} /> Add
            </Button>
          </div>
          {!history ? (
            <Loading />
          ) : history.adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <div className="divide-y divide-border text-sm">
              {history.adjustments.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-2">
                  <span className="w-24 text-muted-foreground">{dateLabel(a.date)}</span>
                  <Badge tone={ADJ_TYPES[a.type].tone}>{ADJ_TYPES[a.type].label}</Badge>
                  <span className="flex-1 truncate text-muted-foreground">{a.note}</span>
                  <span className="font-semibold">
                    {a.type === "bonus" ? "+" : "−"}
                    {money(a.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Salary payments</h2>
          {!history ? (
            <Loading />
          ) : history.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No salary paid yet.</p>
          ) : (
            <div className="divide-y divide-border text-sm">
              {history.payments.map((p) => (
                <Link
                  key={p.id}
                  to="/staff/salary/$month/$employeeId"
                  params={{ month: p.month, employeeId: String(id) }}
                  className="flex justify-between py-2 hover:text-primary"
                >
                  <span>
                    {monthLabel(p.month)}
                    <span className="block text-xs text-muted-foreground">
                      {dateLabel(p.paid_on)} · {p.method}
                    </span>
                  </span>
                  <span className="font-semibold">{money(p.amount)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {editing && (
        <EmployeeForm
          employee={emp}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reloadEmp();
            reloadMonth();
          }}
        />
      )}
      {addingAdj && (
        <AdjustmentForm
          type="advance"
          employees={[emp]}
          employeeId={emp.id}
          defaultDate={today()}
          onClose={() => setAddingAdj(false)}
          onSaved={() => {
            setAddingAdj(false);
            reloadHistory();
            reloadMonth();
          }}
        />
      )}
    </>
  );
}
