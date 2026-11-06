import { Download, Lock, LockOpen, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { monthDates } from "@/lib/payroll";
import { STATUS_LABELS, type AttendanceRecord, type AttendanceStatus } from "@/lib/staff-types";
import { staffApi, useLoad } from "@/lib/staff-api";
import {
  Button,
  Card,
  cx,
  Empty,
  ErrorBox,
  Loading,
  MonthPicker,
  PageHeader,
  statusStyle,
} from "./ui";
import { fmtNum, thisMonth, toCSV, today, weekday } from "./format";
import { saveTextFile } from "./desktop";

const BRUSHES: AttendanceStatus[] = ["A", "H", "L", "O", "P"];
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export default function TimesheetPage() {
  const [month, setMonth] = useState(thisMonth());
  const [brush, setBrush] = useState<AttendanceStatus>("A");
  const [saveError, setSaveError] = useState<string | null>(null);
  // Opens locked so a stray click can't change attendance. Leaving the page locks it again.
  const [editing, setEditing] = useState(false);
  const [lockedHint, setLockedHint] = useState(false);
  useEffect(() => {
    if (!lockedHint) return;
    const t = setTimeout(() => setLockedHint(false), 2500);
    return () => clearTimeout(t);
  }, [lockedHint]);
  const { data, error, setData } = useLoad(async () => {
    const [employees, records, payroll] = await Promise.all([
      staffApi.employees(),
      staffApi.attendanceForMonth(month),
      staffApi.payroll(month),
    ]);
    const onPayroll = new Set(payroll.map((p) => p.line.employee_id));
    const allowed = new Map(payroll.map((p) => [p.line.employee_id, p.line.allowed_leaves]));
    return {
      employees: employees
        .filter((e) => onPayroll.has(e.id))
        .map((e) => ({ ...e, allowed_leaves: allowed.get(e.id) ?? e.allowed_leaves })),
      records,
    };
  }, [month]);

  const dates = monthDates(month);
  const todayStr = today();
  const byKey = new Map((data?.records ?? []).map((r) => [`${r.employee_id}|${r.date}`, r]));

  async function paint(employeeId: number, date: string) {
    if (!data) return;
    if (!editing) {
      setLockedHint(true);
      return;
    }
    const existing = byKey.get(`${employeeId}|${date}`);
    const current = existing?.status ?? "P";
    const status: AttendanceStatus = current === brush ? "P" : brush;
    const rec: AttendanceRecord = {
      employee_id: employeeId,
      date,
      status,
      check_in: existing?.check_in ?? null,
      check_out: existing?.check_out ?? null,
      overtime_hours: existing?.overtime_hours ?? 0,
      note: existing?.note ?? "",
    };
    setData({
      ...data,
      records: [
        ...data.records.filter((r) => !(r.employee_id === employeeId && r.date === date)),
        rec,
      ],
    });
    try {
      await staffApi.saveAttendance([rec]);
      setSaveError(null);
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }

  function summary(employeeId: number, joinDate: string, allowed: number) {
    let a = 0,
      h = 0,
      l = 0,
      ot = 0;
    for (const d of dates) {
      if (d < joinDate) continue;
      const r = byKey.get(`${employeeId}|${d}`);
      if (!r) continue;
      if (r.status === "A") a++;
      if (r.status === "H") h++;
      if (r.status === "L") l++;
      ot += r.overtime_hours;
    }
    const used = a + h * 0.5;
    return { a, h, l, ot, used, extra: Math.max(0, used - allowed) };
  }

  function exportCSV() {
    if (!data) return;
    const rows: (string | number)[][] = [
      [
        "Name",
        ...dates.map((d) => d.slice(8)),
        "Absent",
        "Half days",
        "Paid leave",
        "Leaves used",
        "Allowed",
        "Extra",
        "OT hours",
      ],
    ];
    for (const e of data.employees) {
      const s = summary(e.id, e.join_date, e.allowed_leaves);
      rows.push([
        e.name,
        ...dates.map((d) => (d < e.join_date ? "-" : (byKey.get(`${e.id}|${d}`)?.status ?? "P"))),
        s.a,
        s.h,
        s.l,
        s.used,
        e.allowed_leaves,
        s.extra,
        s.ot,
      ]);
    }
    saveTextFile(`timesheet-${month}.csv`, toCSV(rows), {
      name: "Spreadsheet (CSV)",
      ext: "csv",
    }).catch((e) => setSaveError(String(e)));
  }

  return (
    <>
      <PageHeader
        title="Monthly timesheet"
        subtitle={
          editing
            ? "Pick a mark below, then tap the boxes to apply it. Tap again to set back to present."
            : "View only. Click “Edit” to make changes."
        }
        actions={
          <>
            <MonthPicker month={month} onChange={setMonth} />
            {editing ? (
              <Button onClick={() => setEditing(false)}>
                <Lock size={18} /> Done editing
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => setEditing(true)}
                className={cx(lockedHint && "animate-pulse ring-2 ring-primary")}
              >
                <LockOpen size={18} /> Edit
              </Button>
            )}
            <Button variant="secondary" onClick={exportCSV} disabled={!data?.employees.length}>
              <Download size={18} /> Export
            </Button>
          </>
        }
      />

      {lockedHint && (
        <div className="no-print mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <Lock size={16} /> The timesheet is locked. Click <b>Edit</b> at the top to make changes.
        </div>
      )}

      {editing && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5">
          <span className="text-sm font-medium text-primary">Editing · Mark as:</span>
          {BRUSHES.map((s) => (
            <button
              key={s}
              onClick={() => setBrush(s)}
              className={cx(
                "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium",
                brush === s
                  ? statusStyle[s].solid + " ring-2 ring-offset-1 ring-stone-400"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              <span
                className={cx(
                  "inline-flex h-5 w-5 items-center justify-center rounded text-xs",
                  statusStyle[s].cell,
                )}
              >
                {statusStyle[s].short}
              </span>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {error && <ErrorBox message={error} />}
      {saveError && <ErrorBox message={`Could not save: ${saveError}`} />}

      {!data ? (
        <Loading />
      ) : data.employees.length === 0 ? (
        <Empty icon={<Users size={48} />} title="No staff for this month">
          <Link to="/staff/people" className="font-medium text-primary underline">
            Add staff
          </Link>
        </Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="sticky left-0 z-10 min-w-36 bg-card px-3 py-2 text-left font-medium">
                  Name
                </th>
                {dates.map((d) => {
                  const wd = weekday(d);
                  return (
                    <th
                      key={d}
                      className={cx(
                        "min-w-8 px-0.5 py-1 text-center font-medium",
                        wd === 0 && "bg-muted",
                        d === todayStr && "text-primary",
                      )}
                    >
                      <div className="text-[10px]">{DAY_LETTERS[wd]}</div>
                      <div>{Number(d.slice(8))}</div>
                    </th>
                  );
                })}
                <th className="px-2 text-center font-medium" title="Leaves used / allowed">
                  Leaves
                </th>
                <th
                  className="px-2 text-center font-medium"
                  title="Leaves beyond the allowance – cut from salary"
                >
                  Extra
                </th>
                <th className="px-2 text-center font-medium" title="Overtime hours">
                  OT
                </th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((e) => {
                const s = summary(e.id, e.join_date, e.allowed_leaves);
                return (
                  <tr key={e.id} className="border-t border-border">
                    <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                      <Link
                        to="/staff/people/$id"
                        params={{ id: String(e.id) }}
                        className="font-medium hover:text-primary"
                      >
                        {e.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{e.role}</div>
                    </td>
                    {dates.map((d) => {
                      if (d < e.join_date)
                        return <td key={d} className="bg-muted" title="Not joined yet" />;
                      const rec = byKey.get(`${e.id}|${d}`);
                      const st = rec?.status ?? "P";
                      const future = d > todayStr;
                      return (
                        <td key={d} className="p-0.5">
                          <button
                            onClick={() => paint(e.id, d)}
                            title={`${d}: ${STATUS_LABELS[st]}${rec?.note ? ` – ${rec.note}` : ""}`}
                            className={cx(
                              "h-8 w-full min-w-7 rounded text-xs transition",
                              editing
                                ? "cursor-pointer hover:ring-2 hover:ring-primary"
                                : "cursor-default",
                              st === "P"
                                ? future
                                  ? "bg-muted text-muted-foreground/60"
                                  : statusStyle.P.cell
                                : statusStyle[st].cell,
                            )}
                          >
                            {st === "P" ? (future ? "" : "·") : statusStyle[st].short}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-2 text-center whitespace-nowrap">
                      {fmtNum(s.used)} / {fmtNum(e.allowed_leaves)}
                    </td>
                    <td
                      className={cx(
                        "px-2 text-center font-semibold",
                        s.extra > 0 ? "text-red-600" : "text-muted-foreground/60",
                      )}
                    >
                      {fmtNum(s.extra)}
                    </td>
                    <td className="px-2 text-center">{s.ot ? fmtNum(s.ot) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
