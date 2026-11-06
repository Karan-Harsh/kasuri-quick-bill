import { useState, type FormEvent } from "react";
import type { Employee } from "@/lib/staff-types";
import { staffApi } from "@/lib/staff-api";
import { today, useSettings } from "./format";
import { Button, ErrorBox, Field, Modal } from "./ui";

const ROLES = ["Cook", "Chef", "Helper", "Waiter", "Cleaner", "Cashier", "Manager", "Delivery"];

export default function EmployeeForm({
  employee,
  onClose,
  onSaved,
}: {
  employee?: Employee;
  onClose: () => void;
  onSaved: (e: Employee) => void;
}) {
  const { settings } = useSettings();
  const [form, setForm] = useState({
    name: employee?.name ?? "",
    phone: employee?.phone ?? "",
    role: employee?.role ?? "",
    monthly_salary: employee ? String(employee.monthly_salary) : "",
    allowed_leaves: employee ? String(employee.allowed_leaves) : "2",
    overtime_rate: employee ? String(employee.overtime_rate) : "0",
    join_date: employee?.join_date ?? today(),
    active: employee ? Boolean(employee.active) : true,
    notes: employee?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      ...form,
      monthly_salary: Number(form.monthly_salary),
      allowed_leaves: Number(form.allowed_leaves),
      overtime_rate: Number(form.overtime_rate),
      active: form.active ? 1 : 0,
    };
    try {
      const saved = employee
        ? await staffApi.updateEmployee(employee.id, body)
        : await staffApi.createEmployee(body);
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal title={employee ? `Edit ${employee.name}` : "Add staff member"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBox message={error} />}
        <Field label="Full name">
          <input className="w-full" value={form.name} onChange={set("name")} autoFocus required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Job / role">
            <input
              className="w-full"
              list="roles"
              value={form.role}
              onChange={set("role")}
              placeholder="e.g. Cook"
            />
            <datalist id="roles">
              {ROLES.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
          <Field label="Phone">
            <input className="w-full" type="tel" value={form.phone} onChange={set("phone")} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Monthly salary (${settings.currency_symbol})`}>
            <input
              className="w-full"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={form.monthly_salary}
              onChange={set("monthly_salary")}
              required
            />
          </Field>
          <Field label="Leaves allowed / month" hint="Leaves beyond this are cut from salary">
            <input
              className="w-full"
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={form.allowed_leaves}
              onChange={set("allowed_leaves")}
              required
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Joining date">
            <input
              className="w-full"
              type="date"
              value={form.join_date}
              onChange={set("join_date")}
              required
            />
          </Field>
          <Field
            label={`Overtime pay / hour (${settings.currency_symbol})`}
            hint="Leave 0 if no overtime pay"
          >
            <input
              className="w-full"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={form.overtime_rate}
              onChange={set("overtime_rate")}
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            className="w-full"
            rows={2}
            value={form.notes}
            onChange={set("notes")}
            placeholder="Address, ID proof, bank details…"
          />
        </Field>
        {employee && (
          <label className="flex items-center gap-3 rounded-lg bg-muted p-3">
            <input
              type="checkbox"
              className="h-5 w-5 accent-primary"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <span>
              <span className="font-medium">Currently working here</span>
              <span className="block text-sm text-muted-foreground">
                Untick when someone leaves. Their history is kept.
              </span>
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {employee ? "Save changes" : "Add staff"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
