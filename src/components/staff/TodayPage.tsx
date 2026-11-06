import { ChevronLeft, ChevronRight, Clock, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  STATUS_LABELS,
  type AttendanceRecord,
  type AttendanceStatus,
  type Employee,
} from "@/lib/staff-types";
import { staffApi, useLoad } from "@/lib/staff-api";
import { confirmAction } from "./desktop";
import { Avatar, Button, Card, cx, Empty, ErrorBox, Loading, PageHeader, statusStyle } from "./ui";
import { dateLabel, shiftDate, today } from "./format";

const STATUSES: AttendanceStatus[] = ["P", "A", "H", "L", "O"];
const SHORT_LABELS: Record<AttendanceStatus, string> = {
  P: "Present",
  A: "Absent",
  H: "Half",
  L: "Leave",
  O: "Off",
};

function hoursBetween(a: string | null, b: string | null) {
  if (!a || !b) return null;
  const [ah = 0, am = 0] = a.split(":").map(Number);
  const [bh = 0, bm = 0] = b.split(":").map(Number);
  let mins = bh * 60 + bm - (ah * 60 + am);
  if (mins < 0) mins += 24 * 60; // shift past midnight
  return mins / 60;
}

export default function TodayPage() {
  const [date, setDate] = useState(today());
  const { data, error, setData } = useLoad(async () => {
    const [employees, records] = await Promise.all([
      staffApi.employees(),
      staffApi.attendanceForDate(date),
    ]);
    return { employees: employees.filter((e) => e.active && e.join_date <= date), records };
  }, [date]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  function recordFor(e: Employee): AttendanceRecord {
    return (
      data?.records.find((r) => r.employee_id === e.id) ?? {
        employee_id: e.id,
        date,
        status: "P",
        check_in: null,
        check_out: null,
        overtime_hours: 0,
        note: "",
      }
    );
  }

  async function save(rec: AttendanceRecord) {
    if (!data) return;
    setData({
      ...data,
      records: [...data.records.filter((r) => r.employee_id !== rec.employee_id), rec],
    });
    try {
      await staffApi.saveAttendance([rec]);
      setSaveError(null);
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }

  async function markAllPresent() {
    if (
      !data ||
      !(await confirmAction(
        "Mark everyone as present for this day?\n\nThis clears all absences, half days, leaves, times and notes recorded for the day.",
        "Reset this day",
        "Reset day",
      ))
    )
      return;
    const recs = data.employees.map((e) => ({
      employee_id: e.id,
      date,
      status: "P" as const,
      overtime_hours: 0,
      note: "",
    }));
    setExpanded(null);
    setData({ ...data, records: [] });
    await staffApi.saveAttendance(recs).catch((e) => setSaveError(e.message));
  }

  const counts = STATUSES.map(
    (s) => [s, data?.employees.filter((e) => recordFor(e).status === s).length ?? 0] as const,
  );
  const isToday = date === today();

  return (
    <>
      <PageHeader
        title="Daily attendance"
        subtitle="Everyone is present by default. Just tap the people who are absent, on half day, or on leave."
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-lg border border-border bg-card shadow-sm">
          <button
            className="cursor-pointer p-2.5 hover:bg-muted"
            onClick={() => setDate(shiftDate(date, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="date"
            className="border-0 text-center font-medium focus:ring-0"
            value={date}
            max={today()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <button
            className="cursor-pointer p-2.5 hover:bg-muted disabled:opacity-30"
            onClick={() => setDate(shiftDate(date, 1))}
            disabled={isToday}
            aria-label="Next day"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {!isToday && (
            <Button variant="secondary" size="sm" onClick={() => setDate(today())}>
              Go to today
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={markAllPresent}
            disabled={!data?.records.length}
            title="Mark everyone present and clear the day"
          >
            Reset day
          </Button>
        </div>
      </div>

      <p className="mb-3 text-lg font-semibold">
        {dateLabel(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </p>

      {error && <ErrorBox message={error} />}
      {saveError && <ErrorBox message={`Could not save: ${saveError}`} />}

      {!data ? (
        <Loading />
      ) : data.employees.length === 0 ? (
        <Empty icon={<Users size={48} />} title="No staff working on this date">
          <Link to="/staff/people" className="font-medium text-primary underline">
            Add staff first
          </Link>
        </Empty>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {counts.map(([s, n]) => (
              <span
                key={s}
                className={cx("rounded-full px-3 py-1 text-sm font-medium", statusStyle[s].cell)}
              >
                {STATUS_LABELS[s]}: {n}
              </span>
            ))}
          </div>
          <div className="space-y-3">
            {data.employees.map((e) => {
              const rec = recordFor(e);
              const open = expanded === e.id;
              const worked = hoursBetween(rec.check_in, rec.check_out);
              return (
                <Card key={`${e.id}-${date}`} className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={e.name} id={e.id} />
                    <div className="min-w-32 flex-1">
                      <div className="font-semibold">{e.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {e.role}
                        {(rec.check_in || rec.check_out) && (
                          <span className="ml-2">
                            · {rec.check_in ?? "--"} → {rec.check_out ?? "--"}
                          </span>
                        )}
                        {rec.overtime_hours > 0 && (
                          <span className="ml-2">· OT {rec.overtime_hours}h</span>
                        )}
                      </div>
                    </div>
                    <div className="flex w-full gap-1.5 sm:w-auto">
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          onClick={() => save({ ...rec, status: s })}
                          className={cx(
                            "min-w-0 flex-1 cursor-pointer rounded-lg border px-1 py-2.5 text-xs font-medium transition-colors sm:flex-none sm:px-2.5 sm:py-2 sm:text-sm",
                            rec.status === s
                              ? statusStyle[s].solid
                              : "border-border bg-card text-muted-foreground hover:bg-muted",
                          )}
                        >
                          <span className="sm:hidden">{SHORT_LABELS[s]}</span>
                          <span className="hidden sm:inline">{STATUS_LABELS[s]}</span>
                        </button>
                      ))}
                      <button
                        onClick={() => setExpanded(open ? null : e.id)}
                        className={cx(
                          "cursor-pointer rounded-lg border px-2.5 text-muted-foreground hover:bg-muted",
                          open ? "border-primary bg-primary/10 text-primary" : "border-border",
                        )}
                        title="Times, overtime & note"
                        aria-label="Times, overtime and note"
                      >
                        <Clock size={18} />
                      </button>
                    </div>
                  </div>
                  {open && (
                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
                      <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">Check in</span>
                        <input
                          type="time"
                          className="w-full"
                          defaultValue={rec.check_in ?? ""}
                          onBlur={(ev) => save({ ...rec, check_in: ev.target.value || null })}
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">Check out</span>
                        <input
                          type="time"
                          className="w-full"
                          defaultValue={rec.check_out ?? ""}
                          onBlur={(ev) => save({ ...rec, check_out: ev.target.value || null })}
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">Overtime (hours)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          className="w-full"
                          defaultValue={rec.overtime_hours || ""}
                          onBlur={(ev) =>
                            save({ ...rec, overtime_hours: Number(ev.target.value) || 0 })
                          }
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-muted-foreground">Note</span>
                        <input
                          className="w-full"
                          defaultValue={rec.note}
                          onBlur={(ev) => save({ ...rec, note: ev.target.value })}
                        />
                      </label>
                      {worked !== null && (
                        <p className="col-span-full text-sm text-muted-foreground">
                          Worked {worked.toFixed(1)} hours
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
