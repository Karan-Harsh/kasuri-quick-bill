import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { History, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatQuantity,
  INVENTORY_UNITS,
  movementHint,
  movementLabel,
  type InventoryMovementType,
  type InventoryUnit,
} from "@/lib/inventory";
import { useStaff } from "@/hooks/useStaff";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Kasuri" },
      { name: "description", content: "Track kitchen stock levels and nightly usage at Kasuri." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InventoryPage,
});

interface ItemForm {
  id?: string;
  name: string;
  unit: InventoryUnit;
  current_quantity: string;
  is_active: boolean;
}

interface MovementDialog {
  itemId: string;
  itemName: string;
  unit: string;
  currentQuantity: number;
  type: InventoryMovementType;
}

const emptyForm = (): ItemForm => ({
  name: "",
  unit: "kg",
  current_quantity: "0",
  is_active: true,
});

function InventoryPage() {
  const queryClient = useQueryClient();
  const { data: staff, isLoading: staffLoading } = useStaff();
  const [form, setForm] = useState<ItemForm | null>(null);
  const [movement, setMovement] = useState<MovementDialog | null>(null);
  const [movementQty, setMovementQty] = useState("");
  const [movementNote, setMovementNote] = useState("");

  const itemsQuery = useQuery({
    queryKey: ["inventory-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("id, name, unit, current_quantity, is_active, updated_at")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const movementsQuery = useQuery({
    queryKey: ["inventory-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("id, item_id, movement_type, quantity_change, quantity_after, note, created_at, inventory_items(name, unit)")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
  };

  const saveItem = useMutation({
    mutationFn: async (input: ItemForm) => {
      const name = input.name.trim();
      const qty = Number(input.current_quantity);
      if (!name) throw new Error("Item name is required");
      if (Number.isNaN(qty) || qty < 0) throw new Error("Starting quantity must be zero or more");

      if (input.id) {
        const { error } = await supabase
          .from("inventory_items")
          .update({
            name,
            unit: input.unit,
            is_active: input.is_active,
          })
          .eq("id", input.id);
        if (error) throw error;
        return;
      }

      const { data: created, error } = await supabase
        .from("inventory_items")
        .insert({
          name,
          unit: input.unit,
          current_quantity: 0,
          is_active: input.is_active,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (qty > 0) {
        const { error: moveError } = await supabase.rpc("record_inventory_movement", {
          p_item_id: created.id,
          p_movement_type: "count",
          p_quantity: qty,
          p_note: "Opening stock",
        });
        if (moveError) throw moveError;
      }
    },
    onSuccess: () => {
      invalidate();
      setForm(null);
      toast.success("Inventory item saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  const toggleActive = useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("inventory_items")
        .update({ is_active: input.is_active })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const recordMovement = useMutation({
    mutationFn: async (input: MovementDialog & { quantity: number; note: string }) => {
      const { error } = await supabase.rpc("record_inventory_movement", {
        p_item_id: input.itemId,
        p_movement_type: input.type,
        p_quantity: input.quantity,
        p_note: input.note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setMovement(null);
      setMovementQty("");
      setMovementNote("");
      toast.success("Stock updated");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update stock"),
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

  const items = itemsQuery.data ?? [];
  const movements = movementsQuery.data ?? [];
  const activeItems = items.filter((item) => item.is_active);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Inventory</h1>
            <p className="mt-1 text-muted-foreground">
              Track what is in the kitchen. Update each night with what was used or what is left.
            </p>
          </div>
          <Button className="h-12 text-base" onClick={() => setForm(emptyForm())}>
            <Plus className="mr-2 size-5" /> Add item
          </Button>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeItems.map((item) => (
            <Card key={item.id} className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold">{item.name}</p>
                  <p className="text-3xl font-extrabold text-primary">
                    {formatQuantity(Number(item.current_quantity), item.unit)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Updated {new Date(item.updated_at).toLocaleString("en-IN")}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-9"
                  onClick={() =>
                    setForm({
                      id: item.id,
                      name: item.name,
                      unit: item.unit as InventoryUnit,
                      current_quantity: String(Number(item.current_quantity)),
                      is_active: item.is_active,
                    })
                  }
                >
                  <Pencil className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["used", "received", "count"] as InventoryMovementType[]).map((type) => (
                  <Button
                    key={type}
                    variant={type === "count" ? "default" : "outline"}
                    className="h-11 text-sm"
                    onClick={() => {
                      setMovement({
                        itemId: item.id,
                        itemName: item.name,
                        unit: item.unit,
                        currentQuantity: Number(item.current_quantity),
                        type,
                      });
                      setMovementQty(type === "count" ? String(Number(item.current_quantity)) : "");
                      setMovementNote("");
                    }}
                  >
                    {movementLabel(type)}
                  </Button>
                ))}
              </div>
            </Card>
          ))}
          {itemsQuery.isLoading && (
            <p className="text-muted-foreground">Loading inventory…</p>
          )}
          {!itemsQuery.isLoading && activeItems.length === 0 && (
            <Card className="p-6 text-muted-foreground sm:col-span-2 lg:col-span-3">
              No inventory items yet. Add onions, milk, paneer, and other staples you track daily.
            </Card>
          )}
        </section>

        {items.some((item) => !item.is_active) && (
          <section className="space-y-3">
            <h2 className="text-xl font-bold">Inactive items</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items
                .filter((item) => !item.is_active)
                .map((item) => (
                  <Card key={item.id} className="flex items-center justify-between p-4 opacity-70">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatQuantity(Number(item.current_quantity), item.unit)}
                      </p>
                    </div>
                    <Switch
                      checked={item.is_active}
                      onCheckedChange={(checked) =>
                        toggleActive.mutate({ id: item.id, is_active: checked })
                      }
                    />
                  </Card>
                ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <History className="size-5" /> Recent updates
          </h2>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">Left</th>
                  <th className="px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((row) => {
                  const item = row.inventory_items;
                  const unit = item?.unit ?? "";
                  const change = Number(row.quantity_change);
                  return (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3">
                        {item?.name ?? "—"}
                        <span className="ml-2 text-muted-foreground">
                          ({movementLabel(row.movement_type as InventoryMovementType)})
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {change > 0 ? "+" : ""}
                        {formatQuantity(change, unit)}
                      </td>
                      <td className="px-4 py-3">
                        {formatQuantity(Number(row.quantity_after), unit)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.note ?? "—"}</td>
                    </tr>
                  );
                })}
                {!movementsQuery.isLoading && movements.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                      Stock changes will show up here after your first update.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </section>
      </main>

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit item" : "Add inventory item"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invName">Name</Label>
                <Input
                  id="invName"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Onions"
                  className="h-11"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Select
                    value={form.unit}
                    onValueChange={(value) => setForm({ ...form, unit: value as InventoryUnit })}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVENTORY_UNITS.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invQty">{form.id ? "Current stock" : "Starting stock"}</Label>
                  <Input
                    id="invQty"
                    type="number"
                    min={0}
                    step="any"
                    value={form.current_quantity}
                    onChange={(e) => setForm({ ...form, current_quantity: e.target.value })}
                    className="h-11"
                    disabled={Boolean(form.id)}
                  />
                </div>
              </div>
              {form.id && (
                <p className="text-sm text-muted-foreground">
                  Use Used / Received / Stock count on the card to change quantity. This keeps a
                  history of changes.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                />
                <span className="text-sm text-muted-foreground">Active in inventory list</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button disabled={saveItem.isPending} onClick={() => form && saveItem.mutate(form)}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={movement !== null} onOpenChange={(open) => !open && setMovement(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {movement ? `${movementLabel(movement.type)} — ${movement.itemName}` : "Update stock"}
            </DialogTitle>
          </DialogHeader>
          {movement && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Currently: {formatQuantity(movement.currentQuantity, movement.unit)}.{" "}
                {movementHint(movement.type)}
              </p>
              <div className="space-y-2">
                <Label htmlFor="moveQty">Quantity ({movement.unit})</Label>
                <Input
                  id="moveQty"
                  type="number"
                  min={0}
                  step="any"
                  value={movementQty}
                  onChange={(e) => setMovementQty(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moveNote">Note (optional)</Label>
                <Input
                  id="moveNote"
                  value={movementNote}
                  onChange={(e) => setMovementNote(e.target.value)}
                  placeholder="e.g. closing count"
                  className="h-11"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovement(null)}>
              Cancel
            </Button>
            <Button
              disabled={recordMovement.isPending}
              onClick={() => {
                if (!movement) return;
                const quantity = Number(movementQty);
                if (Number.isNaN(quantity) || quantity < 0) {
                  toast.error("Enter a valid quantity");
                  return;
                }
                recordMovement.mutate({
                  ...movement,
                  quantity,
                  note: movementNote,
                });
              }}
            >
              Save update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
