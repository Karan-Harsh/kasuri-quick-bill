// Estimated ingredients for every dish on the Kasuri menu (rough guesses, to be checked by the kitchen).
//
//   bun scripts/estimated-recipes.ts [output.xlsx]
//
// Writes an Excel setup sheet (Settings → Excel setup) with the stock items and a recipe for every
// dish. Only the main, weighable ingredients are tracked; spices, salt, ginger-garlic etc. are left out.
// Amounts are for a FULL portion; a Half is ~60% of it (unless a dish gives its own half amounts).
// "Stock now" is left empty so uploading never changes current stock.
import { openDatabase } from "../server/db";
import { buildSetupWorkbook } from "../server/setup-sheet";
import { KASURI_MENU } from "../server/starter-menu";
import { Store } from "../server/store";
import { writeXlsx, type Cell } from "../server/xlsx";

// ---------- stock items: name, unit, suggested "warn below" ----------

export const STOCK: [name: string, unit: string, warnBelow: number][] = [
  ["Paneer", "kg", 2],
  ["Chicken (boneless)", "kg", 3],
  ["Chicken (with bone)", "kg", 3],
  ["Chicken liver (kaleji)", "kg", 1],
  ["Mutton", "kg", 2],
  ["Fish", "kg", 2],
  ["Eggs", "pcs", 30],
  ["Mushroom", "kg", 1],
  ["Baby corn", "kg", 1],
  ["Sweet corn", "kg", 1],
  ["Potato", "kg", 5],
  ["Onion", "kg", 5],
  ["Tomato", "kg", 5],
  ["Capsicum", "kg", 2],
  ["Cabbage", "kg", 2],
  ["Carrot", "kg", 2],
  ["Cauliflower", "kg", 2],
  ["Green peas", "kg", 2],
  ["Spinach (palak)", "kg", 1],
  ["Bhindi", "kg", 1],
  ["Basmati rice", "kg", 10],
  ["Atta", "kg", 10],
  ["Maida", "kg", 5],
  ["Besan", "kg", 2],
  ["Cornflour", "kg", 2],
  ["Hakka noodles", "kg", 2],
  ["Yellow dal", "kg", 3],
  ["Black dal (urad)", "kg", 2],
  ["Kabuli chana", "kg", 2],
  ["Cooking oil", "L", 5],
  ["Butter", "kg", 1],
  ["Fresh cream", "L", 1],
  ["Curd", "kg", 2],
  ["Milk", "L", 2],
  ["Cheese", "kg", 0.5],
  ["Cashew", "kg", 0.5],
  ["Chinese sauces (soy/chilli)", "L", 1],
  ["Papad", "pcs", 20],
  ["Water bottle", "pcs", 24],
];

const UNIT = Object.fromEntries(STOCK.map(([n, u]) => [n, u]));
/** Recipe unit: grams / ml / pieces. */
const recipeUnit = (item: string) =>
  UNIT[item] === "kg" ? "g" : UNIT[item] === "L" ? "ml" : "pcs";

// ---------- building blocks (full portion) ----------

type Recipe = Record<string, number>;
const add = (...parts: Recipe[]): Recipe => {
  const out: Recipe = {};
  for (const p of parts) for (const [k, v] of Object.entries(p)) out[k] = (out[k] ?? 0) + v;
  return out;
};

/** Onion-tomato base for Indian curries. */
const GRAVY: Recipe = { Onion: 80, Tomato: 80, "Cooking oil": 25 };
/** Rich makhani/butter base. */
const BUTTERY: Recipe = { Butter: 15, "Fresh cream": 25, Cashew: 10, Tomato: 40 };
/** Indo-Chinese toss. */
const CHINESE: Recipe = {
  Onion: 40,
  Capsicum: 40,
  "Cooking oil": 30,
  Cornflour: 15,
  "Chinese sauces (soy/chilli)": 20,
};
const MIX_VEG: Recipe = { Carrot: 50, "Green peas": 40, Cauliflower: 50, Potato: 50 };
const SOUP_BASE: Recipe = {
  Cabbage: 20,
  Carrot: 20,
  Cornflour: 10,
  "Cooking oil": 5,
  "Chinese sauces (soy/chilli)": 10,
};
const FRIED_RICE: Recipe = {
  "Basmati rice": 150,
  Cabbage: 30,
  Carrot: 30,
  Capsicum: 20,
  Onion: 20,
  "Cooking oil": 20,
  "Chinese sauces (soy/chilli)": 10,
};
const NOODLES: Recipe = {
  "Hakka noodles": 150,
  Cabbage: 50,
  Carrot: 30,
  Capsicum: 30,
  Onion: 30,
  "Cooking oil": 25,
  "Chinese sauces (soy/chilli)": 15,
};
const THALI: Recipe = {
  "Basmati rice": 100,
  Atta: 100,
  "Yellow dal": 40,
  Potato: 60,
  Onion: 30,
  Tomato: 30,
  "Cooking oil": 15,
};
const TANDOORI_MARINADE: Recipe = { Curd: 60, "Cooking oil": 15 };

// ---------- every dish (name as on the menu, before Half/Full) ----------

export const RECIPES: Record<string, Recipe | { full: Recipe; half: Recipe }> = {
  // Soup (Veg)
  "Veg Manchow": add(SOUP_BASE, { Capsicum: 15, "Hakka noodles": 15 }),
  "Veg Hot & Sour": add(SOUP_BASE, { "Chinese sauces (soy/chilli)": 10 }),
  "Veg Sweet Corn": add(SOUP_BASE, { "Sweet corn": 50 }),
  "Veg Lemon Coriander": SOUP_BASE,
  "Veg Clear": { Cabbage: 20, Carrot: 20, "Cooking oil": 5 },
  "Veg Talumein": add(SOUP_BASE, { "Hakka noodles": 30 }),
  "Mushroom Sweet Corn": add(SOUP_BASE, { Mushroom: 30, "Sweet corn": 40 }),
  "Cream of Tomato": { Tomato: 150, Butter: 5, "Fresh cream": 15, Cornflour: 5 },
  "Cream of Mushroom": { Mushroom: 80, Milk: 100, Butter: 5, "Fresh cream": 15, Maida: 5 },
  "Veg Signature": add(SOUP_BASE, { Mushroom: 20, "Baby corn": 20, Paneer: 20 }),
  // Soup (Non Veg)
  "Chicken Manchow": add(SOUP_BASE, {
    Capsicum: 15,
    "Hakka noodles": 15,
    "Chicken (boneless)": 40,
  }),
  "Chicken Hot & Sour": add(SOUP_BASE, {
    "Chinese sauces (soy/chilli)": 10,
    "Chicken (boneless)": 40,
  }),
  "Chicken Sweet Corn": add(SOUP_BASE, { "Sweet corn": 40, "Chicken (boneless)": 40 }),
  "Chicken Lemon Coriander": add(SOUP_BASE, { "Chicken (boneless)": 40 }),
  "Chicken Clear": { Cabbage: 20, Carrot: 20, "Cooking oil": 5, "Chicken (boneless)": 40 },
  "Chicken Talumein": add(SOUP_BASE, { "Hakka noodles": 30, "Chicken (boneless)": 40 }),
  "Cream of Chicken": {
    "Chicken (boneless)": 50,
    Milk: 100,
    Butter: 5,
    "Fresh cream": 15,
    Maida: 5,
  },
  "Chicken Signature": add(SOUP_BASE, { "Chicken (boneless)": 50, Eggs: 1 }),
  // Starter (Veg)
  "French Fries": { Potato: 250, "Cooking oil": 40 },
  "Chilli Gobhi": add(CHINESE, { Cauliflower: 250, Maida: 30, Cornflour: 10 }),
  "Honey Chilli Potato": add(CHINESE, { Potato: 250, Cornflour: 10 }),
  "Veg Manchurian Dry": add(CHINESE, { Cabbage: 100, Carrot: 60, Maida: 30, Cornflour: 5 }),
  "Veg Chilli": add(CHINESE, { Cabbage: 80, Carrot: 50, Capsicum: 20, Maida: 25 }),
  "Crispy Chilli Chana": add(CHINESE, { "Kabuli chana": 100, Cornflour: 15 }),
  "Crispy Chilli Babycorn": add(CHINESE, { "Baby corn": 200, Cornflour: 15, Maida: 20 }),
  "Cheese Churmuri": { Potato: 150, Cheese: 50, Onion: 40, "Cooking oil": 30 },
  "Crispy American Chilli": add(CHINESE, { "Sweet corn": 200, Cornflour: 25 }),
  "American Salt & Pepper": {
    "Sweet corn": 200,
    Cornflour: 40,
    Onion: 30,
    Capsicum: 30,
    "Cooking oil": 40,
  },
  "Paneer Chilli Dry": add(CHINESE, { Paneer: 180, Cornflour: 10, Maida: 15 }),
  "Paneer Salt & Pepper": {
    Paneer: 180,
    Cornflour: 25,
    Onion: 30,
    Capsicum: 30,
    "Cooking oil": 40,
  },
  "Paneer 65": { Paneer: 180, Cornflour: 25, Curd: 30, "Cooking oil": 40 },
  "Spring Roll": {
    Maida: 60,
    Cabbage: 80,
    Carrot: 40,
    Capsicum: 20,
    "Cooking oil": 50,
    "Chinese sauces (soy/chilli)": 10,
  },
  "Onion Pakoda": { Onion: 200, Besan: 80, "Cooking oil": 60 },
  "Paneer Pakoda": { Paneer: 150, Besan: 70, "Cooking oil": 60 },
  // Starter (Non Veg)
  "Egg Chilli": add(CHINESE, { Eggs: 4, Cornflour: 5 }),
  "Fried Chicken": { "Chicken (with bone)": 300, Maida: 40, Cornflour: 20, "Cooking oil": 80 },
  "Pot Kaleji Fry": { "Chicken liver (kaleji)": 250, Onion: 60, "Cooking oil": 30 },
  "Chicken Lollipop": {
    "Chicken (with bone)": 300,
    Cornflour: 30,
    Maida: 20,
    "Cooking oil": 80,
    "Chinese sauces (soy/chilli)": 20,
  },
  "Crispy Chilli Chicken Dry": add(CHINESE, {
    "Chicken (boneless)": 250,
    Cornflour: 15,
    Maida: 20,
  }),
  "Honey Chilli Chicken": add(CHINESE, { "Chicken (boneless)": 250, Cornflour: 15, Maida: 20 }),
  "Chicken Salt & Pepper": {
    "Chicken (boneless)": 250,
    Cornflour: 30,
    Onion: 30,
    Capsicum: 30,
    "Cooking oil": 50,
  },
  "Chicken Tai Pai": add(CHINESE, { "Chicken (boneless)": 250, Cornflour: 15 }),
  "Fish Chilli": add(CHINESE, { Fish: 250, Cornflour: 15 }),
  "Fish Fry (2 piece)": { Fish: 100, Besan: 30, "Cooking oil": 40 },
  // Tandoori Starter (Veg)
  "Hara Bhara Kabab": {
    "Spinach (palak)": 100,
    "Green peas": 60,
    Potato: 100,
    Paneer: 30,
    Besan: 20,
    "Cooking oil": 40,
  },
  "Corn Tikki": { "Sweet corn": 120, Potato: 120, Besan: 20, "Cooking oil": 40 },
  "Paneer Tikka": add(TANDOORI_MARINADE, { Paneer: 200, Capsicum: 50, Onion: 50 }),
  "Paneer Haryali Tikka": add(TANDOORI_MARINADE, {
    Paneer: 200,
    "Spinach (palak)": 30,
    Capsicum: 40,
    Onion: 40,
  }),
  "Mushroom Tikka": add(TANDOORI_MARINADE, { Mushroom: 200, Capsicum: 40, Onion: 40 }),
  "Tandoori Potato": add(TANDOORI_MARINADE, { Potato: 250 }),
  // Tandoori Starter (Non Veg)
  "Fish Tikka": add(TANDOORI_MARINADE, { Fish: 250 }),
  "Chuza Afghani Kabab": add(TANDOORI_MARINADE, {
    "Chicken (with bone)": 350,
    "Fresh cream": 30,
    Cashew: 15,
  }),
  "Murg Haryali Kabab": add(TANDOORI_MARINADE, {
    "Chicken (boneless)": 250,
    "Spinach (palak)": 30,
  }),
  "Chicken Tikka": add(TANDOORI_MARINADE, { "Chicken (boneless)": 250 }),
  "Murg Malai Kabab": add(TANDOORI_MARINADE, {
    "Chicken (boneless)": 250,
    "Fresh cream": 30,
    Cheese: 15,
    Cashew: 10,
  }),
  "Murg Aachari Tikka": add(TANDOORI_MARINADE, { "Chicken (boneless)": 250 }),
  "Murg Lasuni Kabab": add(TANDOORI_MARINADE, { "Chicken (boneless)": 250 }),
  "Murg Banjara Kabab": add(TANDOORI_MARINADE, { "Chicken (boneless)": 250 }),
  "Tandoori Chicken": {
    full: { "Chicken (with bone)": 800, Curd: 120, "Cooking oil": 20, Butter: 10 },
    half: { "Chicken (with bone)": 400, Curd: 60, "Cooking oil": 10, Butter: 5 },
  },
  "Murg Pahadi Kabab": {
    full: { "Chicken (boneless)": 400, Curd: 80, "Spinach (palak)": 40, "Cooking oil": 20 },
    half: { "Chicken (boneless)": 200, Curd: 40, "Spinach (palak)": 20, "Cooking oil": 10 },
  },
  // Chinese Main Course (Veg) — with gravy
  "Paneer Chilli": add(CHINESE, { Paneer: 150, Cornflour: 10 }),
  "Mushroom Chilli": add(CHINESE, { Mushroom: 180, Cornflour: 10 }),
  "Veg Manchurian": add(CHINESE, { Cabbage: 100, Carrot: 60, Maida: 30, Cornflour: 10 }),
  "Paneer Manchurian": add(CHINESE, { Paneer: 150, Maida: 15, Cornflour: 10 }),
  "Mushroom Manchurian": add(CHINESE, { Mushroom: 180, Maida: 15, Cornflour: 10 }),
  // Chinese Main Course (Non Veg)
  "Chicken Chilli": add(CHINESE, { "Chicken (boneless)": 250, Cornflour: 10 }),
  "Ginger Chicken": add(CHINESE, { "Chicken (boneless)": 220, Cornflour: 10 }),
  "Chicken Manchurian": add(CHINESE, { "Chicken (boneless)": 220, Maida: 15, Cornflour: 10 }),
  "Hunan Chicken": add(CHINESE, { "Chicken (boneless)": 250, Cornflour: 10 }),
  // Noodles
  "Veg Hakka Noodles": NOODLES,
  "Veg Mix Hakka Noodles": add(NOODLES, { Mushroom: 30, Paneer: 30, "Baby corn": 30 }),
  "Egg Hakka Noodles": add(NOODLES, { Eggs: 2 }),
  "Chicken Hakka Noodles": add(NOODLES, { "Chicken (boneless)": 100 }),
  "N-Veg Mix Hakka Noodles": add(NOODLES, { "Chicken (boneless)": 80, Eggs: 1 }),
  // Indian Main Course (Veg)
  "Yellow Dal Fry": { "Yellow dal": 80, Onion: 30, Tomato: 30, "Cooking oil": 15 },
  "Yellow Dal Tadka": { "Yellow dal": 80, Onion: 30, Tomato: 30, "Cooking oil": 10, Butter: 10 },
  "Dal Makhni": { "Black dal (urad)": 80, Butter: 25, "Fresh cream": 30, Tomato: 60 },
  "Black Dal Tadka": {
    "Black dal (urad)": 80,
    Onion: 30,
    Tomato: 40,
    "Cooking oil": 15,
    Butter: 10,
  },
  "Veg Kofta": add(GRAVY, {
    Potato: 100,
    Paneer: 50,
    Maida: 15,
    "Fresh cream": 20,
    Cashew: 10,
    "Cooking oil": 30,
  }),
  "Aloo Matar Masala": add(GRAVY, { Potato: 150, "Green peas": 80 }),
  "Aloo Gobhi Matar": add(GRAVY, { Potato: 100, Cauliflower: 150, "Green peas": 50 }),
  "Chana Masala": add(GRAVY, { "Kabuli chana": 100 }),
  "Mix Veg": add(GRAVY, MIX_VEG, { Capsicum: 30 }),
  "Veg Hyderabadi": add(GRAVY, MIX_VEG, { "Spinach (palak)": 40, Cashew: 10 }),
  "Veg Kolhapuri": add(GRAVY, MIX_VEG),
  "Veg Jaipuri": add(GRAVY, MIX_VEG, { "Fresh cream": 20, Cashew: 10, Papad: 1 }),
  "Veg Jalfrezi": {
    Carrot: 50,
    Capsicum: 60,
    Cauliflower: 50,
    "Green peas": 30,
    Onion: 80,
    Tomato: 60,
    "Cooking oil": 25,
  },
  "Veg Kadhai": add(GRAVY, MIX_VEG, { Capsicum: 50 }),
  "Corn Palak": {
    "Sweet corn": 100,
    "Spinach (palak)": 200,
    Onion: 40,
    Tomato: 30,
    "Fresh cream": 15,
    "Cooking oil": 20,
  },
  "Bhindi Masala": { Bhindi: 250, Onion: 60, Tomato: 50, "Cooking oil": 30 },
  // Paneer Specialities
  "Paneer Masala": add(GRAVY, { Paneer: 150 }),
  "Paneer Butter Masala": add(GRAVY, BUTTERY, { Paneer: 150 }),
  "Paneer Tikka Butter Masala": add(GRAVY, BUTTERY, { Paneer: 180, Capsicum: 20, Curd: 30 }),
  "Paneer Pasanda": add(GRAVY, BUTTERY, { Paneer: 160, Cashew: 10 }),
  "Paneer Lababdar": add(GRAVY, BUTTERY, { Paneer: 150 }),
  "Paneer Mushroom Masala": add(GRAVY, { Paneer: 100, Mushroom: 80 }),
  "Paneer Kadhai": add(GRAVY, { Paneer: 150, Capsicum: 50 }),
  "Paneer Hyderabadi": add(GRAVY, { Paneer: 150, "Spinach (palak)": 40, Cashew: 10 }),
  "Paneer Do Pyaza": add(GRAVY, { Paneer: 150, Onion: 80 }),
  "Palak Paneer": {
    Paneer: 120,
    "Spinach (palak)": 250,
    Onion: 40,
    Tomato: 30,
    "Fresh cream": 15,
    "Cooking oil": 20,
  },
  "Matar Paneer": add(GRAVY, { Paneer: 120, "Green peas": 80 }),
  "Paneer Chatpata": add(GRAVY, { Paneer: 150, Capsicum: 30 }),
  // Mushroom Specialities
  "Mushroom Masala": add(GRAVY, { Mushroom: 180 }),
  "Mushroom Butter Masala": add(GRAVY, BUTTERY, { Mushroom: 180 }),
  "Mushroom Kadhai": add(GRAVY, { Mushroom: 180, Capsicum: 50 }),
  "Mushroom Do Pyaza": add(GRAVY, { Mushroom: 180, Onion: 80 }),
  "Mushroom Matar Masala": add(GRAVY, { Mushroom: 130, "Green peas": 70 }),
  // Egg Specialities (full = 2 eggs)
  "Egg Bhurji": { Eggs: 3, Onion: 40, Tomato: 30, "Cooking oil": 15, Butter: 5 },
  "Egg Curry": add(GRAVY, { Eggs: 2 }),
  "Egg Do Pyaza": add(GRAVY, { Eggs: 2, Onion: 80 }),
  "Egg Yellow Dal Tadka": {
    "Yellow dal": 80,
    Eggs: 2,
    Onion: 30,
    Tomato: 30,
    "Cooking oil": 15,
  },
  "Egg Black Dal Tadka": {
    "Black dal (urad)": 80,
    Eggs: 2,
    Onion: 30,
    Tomato: 40,
    "Cooking oil": 15,
    Butter: 10,
  },
  "Egg Masala": add(GRAVY, { Eggs: 2, Capsicum: 20 }),
  "Egg Omelette": { Eggs: 2, Onion: 30, "Cooking oil": 10 },
  "Egg Omelette Curry": add(GRAVY, { Eggs: 2, "Cooking oil": 10 }),
  // Fish Specialities (full = 4 pc)
  "Fish Curry": add(GRAVY, { Fish: 200, "Cooking oil": 20 }),
  "Fish Do Pyaza": add(GRAVY, { Fish: 200, Onion: 80, "Cooking oil": 20 }),
  "Fish Masala": add(GRAVY, { Fish: 200, Capsicum: 20, "Cooking oil": 20 }),
  // Mutton Specialities (full = 4 pc)
  "Mutton Curry": add(GRAVY, { Mutton: 160, Curd: 30 }),
  "Mutton Masala": add(GRAVY, { Mutton: 160, Curd: 30, Onion: 30 }),
  "Mutton Rogan Josh": add(GRAVY, { Mutton: 160, Curd: 50 }),
  "Mutton Kassa": add(GRAVY, { Mutton: 160, Onion: 60, "Cooking oil": 10 }),
  // Chicken Specialities (full = 4 pc)
  "Chicken Curry": add(GRAVY, { "Chicken (with bone)": 250 }),
  "Chicken Masala": add(GRAVY, { "Chicken (with bone)": 250, Capsicum: 20 }),
  "Chicken Hyderabadi": add(GRAVY, {
    "Chicken (with bone)": 250,
    "Spinach (palak)": 40,
    Cashew: 10,
  }),
  "Chicken Kolhapuri": add(GRAVY, { "Chicken (with bone)": 250 }),
  "Chicken Kadhai": add(GRAVY, { "Chicken (with bone)": 250, Capsicum: 50 }),
  "Chicken Do Pyaza": add(GRAVY, { "Chicken (with bone)": 250, Onion: 80 }),
  "Chicken Butter Masala": add(GRAVY, BUTTERY, { "Chicken (boneless)": 200 }),
  "Chicken Tikka Butter Masala": add(GRAVY, BUTTERY, { "Chicken (boneless)": 220, Curd: 40 }),
  "Chicken Kassa": add(GRAVY, { "Chicken (with bone)": 250, Onion: 60, "Cooking oil": 10 }),
  "Chicken Lababdar": add(GRAVY, BUTTERY, { "Chicken (boneless)": 200 }),
  "Tandoori Chicken Masala": add(GRAVY, { "Chicken (with bone)": 300, Curd: 40, Butter: 10 }),
  "Pot Kaleji Masala": add(GRAVY, { "Chicken liver (kaleji)": 250 }),
  // Rice
  "Plain Rice": { "Basmati rice": 150 },
  "Jeera Rice": { "Basmati rice": 150, Butter: 10 },
  "Veg Fried Rice": FRIED_RICE,
  "Mixed Veg Fried Rice": add(FRIED_RICE, { Mushroom: 30, Paneer: 30, "Baby corn": 30 }),
  "Peas Pulao": { "Basmati rice": 150, "Green peas": 60, Onion: 20, Butter: 10 },
  "Egg Fried Rice": add(FRIED_RICE, { Eggs: 2 }),
  "Kashmiri Pulao": { "Basmati rice": 150, Cashew: 15, Butter: 15, "Green peas": 30, Milk: 30 },
  "Chicken Fried Rice": add(FRIED_RICE, { "Chicken (boneless)": 100 }),
  "Mixed Non Veg Fried Rice": add(FRIED_RICE, { "Chicken (boneless)": 80, Eggs: 1 }),
  // Biryani
  "Veg Biryani": add(MIX_VEG, {
    "Basmati rice": 180,
    Onion: 60,
    Curd: 30,
    "Cooking oil": 25,
    Butter: 10,
  }),
  "Egg Biryani": { "Basmati rice": 180, Eggs: 2, Onion: 60, Curd: 30, "Cooking oil": 25 },
  "Chicken Biryani": {
    "Basmati rice": 180,
    "Chicken (with bone)": 250,
    Onion: 70,
    Curd: 40,
    "Cooking oil": 30,
  },
  "Hyderabadi Chicken Biryani": {
    "Basmati rice": 180,
    "Chicken (with bone)": 250,
    Onion: 70,
    Curd: 40,
    "Cooking oil": 30,
    Butter: 10,
  },
  "Chicken Tikka Biryani": {
    "Basmati rice": 180,
    "Chicken (boneless)": 220,
    Onion: 60,
    Curd: 50,
    "Cooking oil": 30,
    Butter: 10,
  },
  "Mutton Biryani": {
    "Basmati rice": 180,
    Mutton: 150,
    Onion: 70,
    Curd: 50,
    "Cooking oil": 30,
    Butter: 10,
  },
  // Breads
  "Tawa Roti": { Atta: 50 },
  "Butter Tawa Roti": { Atta: 50, Butter: 5 },
  "Tandoori Roti": { Atta: 60 },
  "Butter Tandoori Roti": { Atta: 60, Butter: 8 },
  Naan: { Maida: 80, Curd: 10 },
  "Butter Naan": { Maida: 80, Curd: 10, Butter: 10 },
  "Garlic Butter Naan": { Maida: 80, Curd: 10, Butter: 12 },
  "Masala Kulcha": { Maida: 80, Potato: 40, Onion: 20, Butter: 8 },
  "Kashmiri Naan": { Maida: 80, Cashew: 10, Butter: 8 },
  "Punjabi Naan": { Maida: 80, Curd: 10, Butter: 10, Onion: 20 },
  "Stuffed Naan": { Maida: 80, Potato: 50, Paneer: 20, Butter: 8 },
  "Cheese Naan": { Maida: 80, Cheese: 30, Butter: 8 },
  "Plain Paratha": { Atta: 70, "Cooking oil": 10 },
  "Aloo Paratha": { Atta: 80, Potato: 80, "Cooking oil": 15 },
  "Paneer Paratha": { Atta: 80, Paneer: 40, "Cooking oil": 15 },
  // Thali
  "Veg Thali": THALI,
  "Spl. Veg Thali": add(THALI, { Paneer: 60, Curd: 50, Papad: 1 }),
  "Egg Thali": add(THALI, { Eggs: 2 }),
  "Fish Thali": add(THALI, { Fish: 120 }),
  "Chicken Thali": add(THALI, { "Chicken (with bone)": 200 }),
  "Extra Rice": { "Basmati rice": 75 },
  "Extra Special Rice": { "Basmati rice": 75, Butter: 5 },
  "Extra Serving": { "Yellow dal": 30 },
  // Condiments
  "Green Salad": { Onion: 60, Tomato: 60, Carrot: 40 },
  "Onion Salad": { Onion: 100 },
  "Fried Papad": { Papad: 1, "Cooking oil": 10 },
  "Dry Papad": { Papad: 1 },
  "Masala Papad": { Papad: 1, Onion: 20, Tomato: 20 },
  "Mix Raita": { Curd: 150, Onion: 20, Tomato: 20 },
  "Plain Curd": { Curd: 150 },
  Water: { "Water bottle": 1 },
  // Pure Veg Specials
  "Shahi Paneer": add(GRAVY, BUTTERY, { Paneer: 180, Cashew: 10, "Fresh cream": 15 }),
  "Methi Matar Malai": {
    "Green peas": 120,
    "Fresh cream": 50,
    Cashew: 15,
    Onion: 50,
    Butter: 10,
  },
  "Navratna Korma": add(MIX_VEG, {
    Paneer: 40,
    Cashew: 20,
    "Fresh cream": 40,
    Onion: 40,
    Butter: 10,
  }),
};

const HALF = 0.6;
const roundTo = (n: number, unit: string) =>
  unit === "pcs" ? Math.max(1, Math.round(n)) : Math.max(5, Math.round(n / 5) * 5);

/** Every dish as it appears in the app ("X (Half)" / "X (Full)" / "X"), with its recipe lines. */
export function estimatedRecipes() {
  const out: { dish: string; item: string; qty: number; unit: string }[] = [];
  const missing: string[] = [];
  for (const { dishes } of KASURI_MENU) {
    for (const [name, half] of dishes) {
      const r = RECIPES[name];
      if (!r) {
        missing.push(name);
        continue;
      }
      const full = "full" in r ? (r.full as Recipe) : (r as Recipe);
      const halfRecipe: Recipe =
        "half" in r
          ? (r.half as Recipe)
          : Object.fromEntries(Object.entries(full).map(([k, v]) => [k, v * HALF]));
      const sizes: [string, Recipe][] =
        half == null
          ? [[name, full]]
          : [
              [`${name} (Half)`, halfRecipe],
              [`${name} (Full)`, full],
            ];
      for (const [dish, recipe] of sizes)
        for (const [item, qty] of Object.entries(recipe)) {
          if (!UNIT[item]) throw new Error(`${name}: unknown stock item "${item}"`);
          const unit = recipeUnit(item);
          out.push({ dish, item, qty: roundTo(qty, unit), unit });
        }
    }
  }
  if (missing.length) throw new Error(`No recipe for: ${missing.join(", ")}`);
  const onMenu = new Set(KASURI_MENU.flatMap((c) => c.dishes.map(([n]) => n)));
  const unused = Object.keys(RECIPES).filter((n) => !onMenu.has(n));
  if (unused.length) throw new Error(`Recipes for dishes not on the menu: ${unused.join(", ")}`);
  return out;
}

/** The setup workbook: How to use + Inventory (no "Stock now") + Menu + Recipes, all estimated. */
export function estimatedWorkbook() {
  // Build it the same way the app does (fresh database with the Kasuri menu), then fill it in.
  const store = new Store(openDatabase(":memory:"));
  const sheets = buildSetupWorkbook(store);
  const inventory = sheets.find((s) => s.name === "Inventory")!;
  inventory.rows = [inventory.rows[0]!, ...STOCK.map(([n, u, w]): Cell[] => [n, u, null, w])];
  const recipes = sheets.find((s) => s.name === "Recipes")!;
  recipes.rows = [
    recipes.rows[0]!,
    ...estimatedRecipes().map((r): Cell[] => [r.dish, r.item, r.qty, r.unit]),
  ];
  return sheets;
}

if (import.meta.main) {
  const file = process.argv[2] ?? "Kasuri recipes (estimated).xlsx";
  await Bun.write(file, writeXlsx(estimatedWorkbook()));
  console.log(`Wrote ${file}`);
}
