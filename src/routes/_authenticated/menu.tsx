import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { inr } from "@/lib/kasuri";
import { seedKasuriStarterData } from "@/lib/seed-starter-data";
import { useStaff } from "@/hooks/useStaff";

export const Route = createFileRoute("/_authenticated/menu")({
  head: () => ({
    meta: [
      { title: "Menu — Kasuri" },
      { name: "description", content: "Manage Kasuri menu items, prices and GST rates." },
      { property: "og:title", content: "Menu — Kasuri" },
      { property: "og:description", content: "Manage Kasuri menu items, prices and GST rates." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MenuPage,
});

interface ItemForm {
  id?: string;
  name: string;
  category_id: string;
  price: string;
  tax_rate: string;
  is_active: boolean;
}

const emptyForm = (categoryId: string): ItemForm => ({
  name: "",
  category_id: categoryId,
  price: "",
  tax_rate: "5",
  is_active: true,
});

function MenuPage() {
  const queryClient = useQueryClient();
  const { data: staff } = useStaff();
  const isAdmin = staff?.role === "admin";
  const [form, setForm] = useState<ItemForm | null>(null);
  const [newCategory, setNewCategory] = useState("");

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["menu-items", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, price, tax_rate, is_active, category_id")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["tables"] });
  };

  const seedStarter = useMutation({
    mutationFn: seedKasuriStarterData,
    onSuccess: (result) => {
      invalidate();
      toast.success(
        `Starter data loaded — ${result.tables} tables, ${result.menuItems} dishes`,
      );
      if (result.tablesSkipped) {
        toast.message("Tables were not added", {
          description:
            "Run the SQL in supabase/sql-editor-tables.sql once, then click Load starter menu again.",
        });
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not load starter data"),
  });

  const saveItem = useMutation({
    mutationFn: async (input: ItemForm) => {
      const payload = {
        name: input.name.trim(),
        category_id: input.category_id,
        price: Number(input.price) || 0,
        tax_rate: Number(input.tax_rate) || 0,
        is_active: input.is_active,
      };
      if (!payload.name) throw new Error("Item name is required");
      if (!payload.category_id) throw new Error("Pick a category");
      if (input.id) {
        const { error } = await supabase.from("menu_items").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("menu_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      setForm(null);
      toast.success("Menu saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  const toggleActive = useMutation({
    mutationFn: async (input: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("menu_items")
        .update({ is_active: input.is_active })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update"),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Item deleted");
    },
    onError: () =>
      toast.error("Could not delete. Deactivate it instead if it appears on old bills."),
  });

  const addCategory = useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Category name is required");
      const nextOrder = (categoriesQuery.data?.length ?? 0) + 1;
      const { error } = await supabase
        .from("categories")
        .insert({ name: trimmed, sort_order: nextOrder });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setNewCategory("");
      toast.success("Category added");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add"),
  });

  const categories = categoriesQuery.data ?? [];
  const items = itemsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">Menu</h1>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (categories.length === 0 || items.length === 0) && (
              <Button
                variant="outline"
                className="h-12 text-base"
                disabled={seedStarter.isPending}
                onClick={() => seedStarter.mutate()}
              >
                Load starter menu
              </Button>
            )}
            {isAdmin && (
              <Button
                className="h-12 text-base"
                onClick={() => setForm(emptyForm(categories[0]?.id ?? ""))}
              >
                <Plus className="mr-2 size-5" /> Add item
              </Button>
            )}
          </div>
        </div>

        {!isAdmin && (
          <p className="rounded-lg border border-border bg-card p-4 text-muted-foreground">
            You are signed in as a cashier, so the menu is read-only. Ask the owner/admin
            account to make changes.
          </p>
        )}

        {isAdmin && (
          <Card className="flex flex-wrap items-end gap-3 p-4">
            <div className="space-y-2">
              <Label htmlFor="newCategory">New category</Label>
              <Input
                id="newCategory"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. Chinese"
                className="h-11 w-56"
              />
            </div>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => addCategory.mutate(newCategory)}
            >
              Add category
            </Button>
          </Card>
        )}

        {categories.map((category) => {
          const catItems = items.filter((item) => item.category_id === category.id);
          return (
            <section key={category.id} className="space-y-3">
              <h2 className="text-xl font-bold">{category.name}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {catItems.map((item) => (
                  <Card
                    key={item.id}
                    className={`space-y-3 p-4 ${item.is_active ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-lg font-semibold leading-tight">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {inr(Number(item.price))} · GST {Number(item.tax_rate)}%
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-9"
                            onClick={() =>
                              setForm({
                                id: item.id,
                                name: item.name,
                                category_id: item.category_id,
                                price: String(Number(item.price)),
                                tax_rate: String(Number(item.tax_rate)),
                                is_active: item.is_active,
                              })
                            }
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-9 text-destructive"
                            onClick={() => deleteItem.mutate(item.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={item.is_active}
                        disabled={!isAdmin}
                        onCheckedChange={(checked) =>
                          toggleActive.mutate({ id: item.id, is_active: checked })
                        }
                      />
                      <span className="text-sm text-muted-foreground">
                        {item.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </Card>
                ))}
                {catItems.length === 0 && (
                  <p className="text-muted-foreground">No items in this category yet.</p>
                )}
              </div>
            </section>
          );
        })}
      </main>

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit item" : "Add item"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="itemName">Name</Label>
                <Input
                  id="itemName"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.category_id}
                  onValueChange={(value) => setForm({ ...form, category_id: value })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Pick a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="price">Price (₹)</Label>
                  <Input
                    id="price"
                    type="number"
                    min={0}
                    step="1"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tax">GST rate (%)</Label>
                  <Input
                    id="tax"
                    type="number"
                    min={0}
                    step="0.5"
                    value={form.tax_rate}
                    onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                    className="h-11"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                />
                <span className="text-sm text-muted-foreground">Active on the order screen</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button
              disabled={saveItem.isPending}
              onClick={() => form && saveItem.mutate(form)}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
