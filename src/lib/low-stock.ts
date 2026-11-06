import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { isLowStock } from "@/lib/inventory";

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  current_quantity: number;
  low_stock_level: number | null;
  /** Price per unit paid on the latest delivery with an amount entered, and when. */
  last_price: number | null;
  last_price_at: string | null;
  is_active: boolean;
  updated_at: string;
  /** How many dishes use this item in their recipe. */
  dish_count: number;
}

/** Stock items (shared cache with the Inventory screen), refreshed whenever stock changes. */
export function useInventoryItems() {
  return useQuery({
    queryKey: ["inventory-items"],
    queryFn: () => api.get<InventoryItem[]>("/inventory/items"),
  });
}

/** Active stock items that have gone below their minimum level. */
export function useLowStockItems() {
  const { data } = useInventoryItems();
  return (data ?? []).filter((item) => item.is_active && isLowStock(item));
}
