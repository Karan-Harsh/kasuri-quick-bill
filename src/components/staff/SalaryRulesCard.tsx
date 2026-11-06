import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { staffApi } from "@/lib/staff-api";
import type { Settings } from "@/lib/staff-types";
import { useSettings } from "./format";

const BASES = [
  [
    "calendar",
    "Salary ÷ days in that month",
    "e.g. ₹10,000 salary: one leave cuts ₹333 in a 30-day month, ₹323 in a 31-day month",
  ],
  ["fixed30", "Salary ÷ 30, always", "e.g. ₹10,000 salary: one leave always cuts ₹333"],
] as const;

/** Settings → Salary rules: how leave cuts and unused leaves are worked out. Saves on change. */
export function SalaryRulesCard() {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) => staffApi.saveSettings(patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Salary rules saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <Wallet className="mt-1 size-6 shrink-0 text-primary" />
        <div>
          <h2 className="text-xl font-bold">Salary rules</h2>
          <p className="text-sm text-muted-foreground">
            Salary is fixed per calendar month: someone who works the full month gets their full
            salary, whether the month has 28, 30 or 31 days.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-medium">How much is cut for one extra leave?</p>
        <p className="text-sm text-muted-foreground">
          Also used to pay part of the month to someone who joined mid-month.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {BASES.map(([value, title, hint]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-lg border p-3 ${
                settings.per_day_basis === value ? "border-primary bg-primary/10" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="perDayBasis"
                className="sr-only"
                checked={settings.per_day_basis === value}
                onChange={() => save.mutate({ per_day_basis: value })}
              />
              <span className="block font-medium">{title}</span>
              <span className="block text-sm text-muted-foreground">{hint}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border p-4">
        <span>
          <span className="block font-medium">Pay extra for leaves not taken</span>
          <span className="block text-sm text-muted-foreground">
            If someone is allowed 4 leaves but takes only 1, they get 3 days' salary extra.
          </span>
        </span>
        <Switch
          checked={settings.pay_unused_leaves}
          onCheckedChange={(checked) => save.mutate({ pay_unused_leaves: checked })}
        />
      </label>

      <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        <b className="text-foreground">How salary is worked out:</b> monthly salary − (extra leaves
        × one day's salary) + overtime + bonus − advances − other deductions. Absent = 1 leave, half
        day = ½ leave. Paid leave and week offs are never cut.
      </p>
    </Card>
  );
}
