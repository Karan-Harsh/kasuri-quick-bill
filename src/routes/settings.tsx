import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { WaiterPhonesCard } from "@/components/WaiterPhonesCard";
import { ExcelSetupCard } from "@/components/ExcelSetupCard";
import { SalaryRulesCard } from "@/components/staff/SalaryRulesCard";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Kasuri" }] }),
  component: SettingsPage,
});

interface SystemInfo {
  dataDir: string;
  dbPath: string;
  backupDir: string;
  lastBackup: string | null;
}

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: orgSettings } = useOrganizationSettings();

  const systemQuery = useQuery({
    queryKey: ["system"],
    queryFn: () => api.get<SystemInfo>("/system"),
  });

  const updateGst = useMutation({
    mutationFn: (gstEnabled: boolean) => api.put("/settings", { gst_enabled: gstEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-settings"] });
      toast.success("GST setting saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  const backupNow = useMutation({
    mutationFn: () => api.post<{ file: string }>("/system/backup"),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["system"] });
      toast.success("Backup saved", { description: result.file });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Backup failed"),
  });

  const gstEnabled = orgSettings?.gst_enabled ?? false;
  const system = systemQuery.data;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <h1 className="text-3xl font-bold">Settings</h1>

        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-xl font-bold">GST on bills</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Turn off while the restaurant is below the GST registration threshold. New bills will
              exclude GST; past settled bills keep what was charged at the time.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <p className="font-semibold">Charge GST on new bills</p>
              <p className="text-sm text-muted-foreground">
                {gstEnabled
                  ? "GST is added to open orders and receipts."
                  : "Bills show subtotal only (no GST line)."}
              </p>
            </div>
            <Switch
              checked={gstEnabled}
              disabled={updateGst.isPending}
              onCheckedChange={(checked) => updateGst.mutate(checked)}
            />
          </div>
        </Card>

        <ExcelSetupCard />

        <SalaryRulesCard />

        <WaiterPhonesCard />

        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-xl font-bold">Data &amp; backups</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything is stored on this computer — no internet needed. A backup copy is saved
              automatically once a day, and the last 30 days are kept.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border p-4 text-sm">
            <HardDrive className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <p>
                <span className="text-muted-foreground">Database:</span>{" "}
                <span className="break-all font-medium">{system?.dbPath ?? "…"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Backups:</span>{" "}
                <span className="break-all font-medium">{system?.backupDir ?? "…"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Last backup:</span>{" "}
                {system?.lastBackup
                  ? new Date(system.lastBackup).toLocaleString("en-IN")
                  : "Not yet"}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Tip: copy the backups folder to a pen drive or Google Drive now and then, so the data
            survives even if this computer breaks.
          </p>
          <Button
            variant="outline"
            className="h-11"
            disabled={backupNow.isPending}
            onClick={() => backupNow.mutate()}
          >
            Back up now
          </Button>
        </Card>

        <Button asChild variant="outline" className="h-11">
          <Link to="/dashboard">Back to tables</Link>
        </Button>
      </main>
    </div>
  );
}
