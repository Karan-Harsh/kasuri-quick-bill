import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileSpreadsheet, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
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
import { compatibleUnits, formatQuantity } from "@/lib/inventory";
import { useInventoryItems } from "@/lib/low-stock";

export const Route = createFileRoute("/menu")({
  head: () => ({ meta: [{ title: "Menu — Kasuri" }] }),
  component: MenuPage,
});

interface IngredientLine {
  inventory_item_id: string;
  quantity: string;
  unit: string;
}

interface ItemForm {
  id?: string;
  name: string;
  category_id: string;
  price: string;
  tax_rate: string;
  is_active: boolean;
  /** What one portion uses from stock. */
  ingredients: IngredientLine[];
}

interface MenuIngredient {
  id: string;
  menu_item_id: string;
  inventory_item_id: string;
  quantity: number;
  unit: string;
  inventory_name: string;
}

const emptyForm = (categoryId: string): ItemForm => ({
  name: "",
  category_id: categoryId,
  price: "",
  tax_rate: "5",
  is_active: true,
  ingredients: [],
});

function MenuPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ItemForm | null>(null);
  const [newCategory, setNewCategory] = useState("");

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<{ id: string; name: string; sort_order: number }[]>("/categories"),
  });

  const itemsQuery = useQuery({
    queryKey: ["menu-items", "all"],
    queryFn: () =>
      api.get<
        {
          id: string;
          name: string;
          price: number;
          tax_rate: number;
          is_active: boolean;
          category_id: string;
        }[]
      >("/menu-items"),
  });

  const ingredientsQuery = useQuery({
    queryKey: ["menu-ingredients"],
    queryFn: () => api.get<MenuIngredient[]>("/menu-ingredients"),
  });
  const stockItems = useInventoryItems().data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["menu-items"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["tables"] });
  };

  const seedStarter = useMutation({
    mutationFn: () =>
      api.post<{ tables: number; menuItems: number; tablesSkipped: boolean }>("/seed-starter"),
    onSuccess: (result) => {
      invalidate();
      toast.success(`Starter data loaded — ${result.tables} tables, ${result.menuItems} dishes`);
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
        ingredients: input.ingredients
          .filter((line) => line.inventory_item_id)
          .map((line) => ({
            inventory_item_id: line.inventory_item_id,
            quantity: Number(line.quantity),
            unit: line.unit,
          })),
      };
      if (!payload.name) throw new Error("Item name is required");
      if (!payload.category_id) throw new Error("Pick a category");
      if (input.id) await api.patch(`/menu-items/${input.id}`, payload);
      else await api.post("/menu-items", payload);
    },
    onSuccess: () => {
      invalidate();
      setForm(null);
      toast.success("Menu saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; is_active: boolean }) =>
      api.patch(`/menu-items/${input.id}`, { is_active: input.is_active }),
    onSuccess: invalidate,
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update"),
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => api.del(`/menu-items/${id}`),
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
      await api.post("/categories", { name: trimmed });
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
  const recipes = ingredientsQuery.data ?? [];
  const recipeOf = (menuItemId: string) => recipes.filter((r) => r.menu_item_id === menuItemId);
  const stockById = new Map(stockItems.map((item) => [item.id, item]));

  const setLine = (index: number, patch: Partial<IngredientLine>) =>
    form &&
    setForm({
      ...form,
      ingredients: form.ingredients.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">Menu</h1>
          <div className="flex flex-wrap gap-2">
            {(categories.length === 0 || items.length === 0) && (
              <Button
                variant="outline"
                className="h-12 text-base"
                disabled={seedStarter.isPending}
                onClick={() => seedStarter.mutate()}
              >
                Load starter menu
              </Button>
            )}
            <Button asChild variant="outline" className="h-12 text-base">
              <Link to="/settings" hash="excel-setup">
                <FileSpreadsheet className="mr-2 size-5" /> Add many from Excel
              </Link>
            </Button>
            <Button
              className="h-12 text-base"
              onClick={() => setForm(emptyForm(categories[0]?.id ?? ""))}
            >
              <Plus className="mr-2 size-5" /> Add item
            </Button>
          </div>
        </div>

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
                        {recipeOf(item.id).length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Uses{" "}
                            {recipeOf(item.id)
                              .map(
                                (r) => `${formatQuantity(r.quantity, r.unit)} ${r.inventory_name}`,
                              )
                              .join(", ")}
                          </p>
                        )}
                      </div>
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
                              ingredients: recipeOf(item.id).map((r) => ({
                                inventory_item_id: r.inventory_item_id,
                                quantity: String(r.quantity),
                                unit: r.unit,
                              })),
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
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={item.is_active}
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

              <div className="space-y-2 border-t border-border pt-4">
                <Label>Ingredients for one portion</Label>
                <p className="text-sm text-muted-foreground">
                  Taken out of inventory each time this dish is billed.
                </p>
                {form.ingredients.map((line, index) => {
                  const stock = stockById.get(line.inventory_item_id);
                  const usedElsewhere = new Set(
                    form.ingredients.filter((_, i) => i !== index).map((l) => l.inventory_item_id),
                  );
                  return (
                    <div key={index} className="flex items-center gap-2">
                      <Select
                        value={line.inventory_item_id}
                        onValueChange={(value) => {
                          const picked = stockById.get(value);
                          setLine(index, {
                            inventory_item_id: value,
                            // Smallest unit first (g, ml, pcs): recipes are usually small amounts.
                            unit: picked ? compatibleUnits(picked.unit)[0]! : line.unit,
                          });
                        }}
                      >
                        <SelectTrigger className="h-11 flex-1">
                          <SelectValue placeholder="Stock item" />
                        </SelectTrigger>
                        <SelectContent>
                          {stockItems
                            .filter(
                              (s) =>
                                (s.is_active && !usedElsewhere.has(s.id)) ||
                                s.id === line.inventory_item_id,
                            )
                            .map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={line.quantity}
                        onChange={(e) => setLine(index, { quantity: e.target.value })}
                        placeholder="Qty"
                        className="h-11 w-24"
                        aria-label="Quantity per portion"
                      />
                      <Select
                        value={line.unit}
                        onValueChange={(value) => setLine(index, { unit: value })}
                        disabled={!stock}
                      >
                        <SelectTrigger className="h-11 w-24" aria-label="Unit">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {(stock ? compatibleUnits(stock.unit) : [line.unit]).map((unit) => (
                            <SelectItem key={unit} value={unit}>
                              {unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-11 shrink-0"
                        aria-label="Remove ingredient"
                        onClick={() =>
                          setForm({
                            ...form,
                            ingredients: form.ingredients.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  );
                })}
                {stockItems.some((s) => s.is_active) ? (
                  <Button
                    variant="outline"
                    className="h-11"
                    onClick={() =>
                      setForm({
                        ...form,
                        ingredients: [
                          ...form.ingredients,
                          { inventory_item_id: "", quantity: "", unit: "" },
                        ],
                      })
                    }
                  >
                    <Plus className="mr-2 size-4" /> Add ingredient
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Add stock items on the Inventory screen first.
                  </p>
                )}
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
    </div>
  );
}
