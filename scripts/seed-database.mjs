/**
 * One-time / repeat-safe seed for tables, categories, and menu items.
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (Dashboard → Project Settings → API).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* .env optional if vars already exported */
  }
}

loadEnv();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.\n" +
      "Get the service role key from Supabase Dashboard → Project Settings → API.",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = [
  { table_number: 1, label: "T1" },
  { table_number: 2, label: "T2" },
  { table_number: 3, label: "T3" },
  { table_number: 4, label: "T4" },
  { table_number: 5, label: "T5" },
  { table_number: 6, label: "T6" },
  { table_number: 7, label: "T7" },
  { table_number: 8, label: "T8" },
];

const categories = [
  { name: "Starters", sort_order: 1 },
  { name: "Main Course", sort_order: 2 },
  { name: "Breads", sort_order: 3 },
  { name: "Beverages", sort_order: 4 },
];

const menuItems = [
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
];

async function main() {
  console.log("Seeding restaurant tables…");
  for (const table of tables) {
    const { error } = await supabase
      .from("restaurant_tables")
      .upsert(table, { onConflict: "table_number", ignoreDuplicates: true });
    if (error) throw error;
  }

  console.log("Seeding categories…");
  for (const category of categories) {
    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .eq("name", category.name)
      .maybeSingle();
    if (existing) continue;
    const { error } = await supabase.from("categories").insert(category);
    if (error) throw error;
  }

  const { data: categoryRows, error: catError } = await supabase
    .from("categories")
    .select("id, name");
  if (catError) throw catError;
  const categoryByName = new Map(categoryRows.map((row) => [row.name, row.id]));

  console.log("Seeding menu items…");
  for (const item of menuItems) {
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

  console.log(`Done. ${tableCount ?? 0} tables, ${itemCount ?? 0} menu items in database.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
