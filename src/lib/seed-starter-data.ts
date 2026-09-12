import { supabase } from "@/integrations/supabase/client";

const STARTER_TABLES = [
  { table_number: 1, label: "T1" },
  { table_number: 2, label: "T2" },
  { table_number: 3, label: "T3" },
  { table_number: 4, label: "T4" },
  { table_number: 5, label: "T5" },
  { table_number: 6, label: "T6" },
  { table_number: 7, label: "T7" },
  { table_number: 8, label: "T8" },
] as const;

const STARTER_CATEGORIES = [
  { name: "Starters", sort_order: 1 },
  { name: "Main Course", sort_order: 2 },
  { name: "Breads", sort_order: 3 },
  { name: "Beverages", sort_order: 4 },
] as const;

const STARTER_MENU = [
  { category: "Starters", name: "Paneer Tikka", price: 220, tax_rate: 5 },
  { category: "Starters", name: "Chicken 65", price: 260, tax_rate: 5 },
  { category: "Starters", name: "Veg Manchurian", price: 180, tax_rate: 5 },
  { category: "Starters", name: "Masala Papad", price: 60, tax_rate: 5 },
  { category: "Starters", name: "Spring Roll", price: 150, tax_rate: 5 },
  { category: "Main Course", name: "Paneer Butter Masala", price: 260, tax_rate: 5 },
  { category: "Main Course", name: "Dal Tadka", price: 180, tax_rate: 5 },
  { category: "Main Course", name: "Chicken Curry", price: 290, tax_rate: 5 },
  { category: "Main Course", name: "Mixed Veg Kadai", price: 220, tax_rate: 5 },
  { category: "Main Course", name: "Palak Paneer", price: 240, tax_rate: 5 },
  { category: "Breads", name: "Tandoori Roti", price: 20, tax_rate: 5 },
  { category: "Breads", name: "Butter Naan", price: 45, tax_rate: 5 },
  { category: "Breads", name: "Garlic Naan", price: 60, tax_rate: 5 },
  { category: "Breads", name: "Laccha Paratha", price: 55, tax_rate: 5 },
  { category: "Beverages", name: "Masala Chai", price: 30, tax_rate: 5 },
  { category: "Beverages", name: "Fresh Lime Soda", price: 70, tax_rate: 18 },
  { category: "Beverages", name: "Cold Coffee", price: 120, tax_rate: 18 },
  { category: "Beverages", name: "Mango Lassi", price: 90, tax_rate: 5 },
] as const;

export async function seedKasuriStarterData() {
  let tablesSkipped = false;

  for (const table of STARTER_TABLES) {
    const { data: existing } = await supabase
      .from("restaurant_tables")
      .select("id")
      .eq("table_number", table.table_number)
      .maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from("restaurant_tables").insert(table);
    if (error) {
      if (error.code === "42501") {
        tablesSkipped = true;
        break;
      }
      throw error;
    }
  }

  for (const category of STARTER_CATEGORIES) {
    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .eq("name", category.name)
      .maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from("categories").insert(category);
    if (error) throw error;
  }

  const { data: categories, error: categoryError } = await supabase
    .from("categories")
    .select("id, name");
  if (categoryError) throw categoryError;

  const categoryByName = new Map(categories.map((row) => [row.name, row.id]));

  for (const item of STARTER_MENU) {
    const categoryId = categoryByName.get(item.category);
    if (!categoryId) throw new Error(`Missing category: ${item.category}`);

    const { data: existing } = await supabase
      .from("menu_items")
      .select("id")
      .eq("category_id", categoryId)
      .eq("name", item.name)
      .maybeSingle();
    if (existing) continue;

    const { error } = await supabase.from("menu_items").insert({
      category_id: categoryId,
      name: item.name,
      price: item.price,
      tax_rate: item.tax_rate,
      is_active: true,
    });
    if (error) throw error;
  }

  const { count: tableCount } = await supabase
    .from("restaurant_tables")
    .select("*", { count: "exact", head: true });
  const { count: itemCount } = await supabase
    .from("menu_items")
    .select("*", { count: "exact", head: true });

  return {
    tables: tableCount ?? 0,
    menuItems: itemCount ?? 0,
    tablesSkipped,
  };
}
