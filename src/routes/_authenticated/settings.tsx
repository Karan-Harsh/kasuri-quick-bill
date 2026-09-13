import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { useStaff } from "@/hooks/useStaff";
import { createStaffUser, listStaffUsers } from "@/server/staff.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Kasuri" },
      { name: "description", content: "Organization settings and staff accounts for Kasuri." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: staff, isLoading: staffLoading } = useStaff();
  const { data: orgSettings } = useOrganizationSettings();
  const listStaffFn = useServerFn(listStaffUsers);
  const createStaffFn = useServerFn(createStaffUser);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"cashier" | "admin" | "kitchen">("cashier");

  const staffQuery = useQuery({
    queryKey: ["staff-users"],
    enabled: staff?.role === "admin",
    queryFn: () => listStaffFn(),
  });

  const updateGst = useMutation({
    mutationFn: async (gstEnabled: boolean) => {
      const { error } = await supabase
        .from("organization_settings")
        .update({ gst_enabled: gstEnabled, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-settings"] });
      toast.success("GST setting saved");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not save";
      if (message.includes("organization_settings")) {
        toast.error("Run the latest database migration first (organization_settings).");
        return;
      }
      toast.error(message);
    },
  });

  const addStaff = useMutation({
    mutationFn: async () =>
      createStaffFn({
        data: { email: email.trim(), password, role },
      }),
    onSuccess: () => {
      setEmail("");
      setPassword("");
      setRole("cashier");
      queryClient.invalidateQueries({ queryKey: ["staff-users"] });
      toast.success("Staff account created");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create"),
  });

  if (staffLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <p className="p-8 text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (staff?.role !== "admin") {
    return <Navigate to="/dashboard" />;
  }

  const gstEnabled = orgSettings?.gst_enabled ?? false;
  const staffList = staffQuery.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="mt-1 text-muted-foreground">Signed in as {staff.email} · Admin</p>
        </div>

        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-xl font-bold">GST on bills</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Turn off while the restaurant is below the GST registration threshold. New bills
              will exclude GST; past settled bills keep what was charged at the time.
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

        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-xl font-bold">Staff accounts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create login credentials for cashiers and kitchen staff. They use the staff
              sign-in page — public sign-up is disabled once an admin exists.
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="space-y-2">
              <Label htmlFor="staffEmail">Email</Label>
              <Input
                id="staffEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
                placeholder="cashier@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staffPassword">Password</Label>
              <Input
                id="staffPassword"
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
                placeholder="At least 6 characters"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as "cashier" | "admin" | "kitchen")}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cashier">Cashier</SelectItem>
                  <SelectItem value="kitchen">Kitchen</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="h-11 w-full"
              disabled={addStaff.isPending || !email.trim() || password.length < 6}
              onClick={() => addStaff.mutate()}
            >
              Create staff account
            </Button>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Current staff</h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {staffList.map((member) => (
                <li key={member.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>{member.email}</span>
                  <span className="capitalize text-muted-foreground">{member.role ?? "—"}</span>
                </li>
              ))}
              {staffQuery.isLoading && (
                <li className="px-4 py-3 text-sm text-muted-foreground">Loading staff…</li>
              )}
              {!staffQuery.isLoading && staffList.length === 0 && (
                <li className="px-4 py-3 text-sm text-muted-foreground">No staff accounts yet.</li>
              )}
            </ul>
          </div>
        </Card>

        <Button asChild variant="outline" className="h-11">
          <Link to="/dashboard">Back to tables</Link>
        </Button>
      </main>
    </div>
  );
}
