// Starting stock items, prices and recipes for the Kasuri menu: rough estimates to begin with.
// Prices are per kg / L / piece and change day to day: set real ones in Inventory (or an Excel
// upload), and recording a delivery with the amount paid updates them.
// Recipes are for a FULL plate, including salt, spices and aromatics in small amounts;
// a half plate uses HALF_PORTION (60%) of it.
import type { Database } from "bun:sqlite";
import { now, uuid } from "./db";

/**
 * Stock items: from the restaurant's shopping lists (local name first), plus a few the menu needs
 * that weren't on them (marked "not on list"). Units are how stock is counted: sacks (bora), packets
 * and the oil tin are kept in kg / L so small amounts per dish can be tracked; things bought by the
 * piece (lemons, gobi, whole chickens, tins, containers) are kept in pieces.
 */
export const STARTER_STOCK: [
  name: string,
  unit: string,
  warnBelow: number,
  pricePerUnit: number,
][] = [
  // Vegetables (sabji)
  ["Onion", "kg", 10, 35],
  ["Tamatar (tomato)", "kg", 3, 40],
  ["Gajar (carrot)", "kg", 1, 50],
  ["Khira (cucumber)", "kg", 1, 40],
  ["Adrak (ginger)", "kg", 0.5, 120],
  ["Lasun (garlic)", "kg", 0.5, 160],
  ["Mirchi (green chilli)", "kg", 0.5, 80],
  ["Dhaniya patta (coriander)", "kg", 0.25, 80],
  ["Lemon", "pcs", 10, 5],
  ["Phool gobi (cauliflower)", "pcs", 2, 30],
  ["Bandha gobi (cabbage)", "pcs", 2, 30],
  ["Bhindi (vendi)", "kg", 1, 50],
  ["Patal (pointed gourd)", "kg", 1, 50],
  ["Lauki (bottle gourd)", "kg", 1, 30],
  ["Kumra (pumpkin)", "kg", 1, 30],
  ["Borboti (long beans)", "kg", 0.5, 50],
  ["Beans", "kg", 0.5, 60],
  ["Palak (spinach)", "kg", 1, 40],
  ["Mushroom (tin)", "pcs", 2, 120],
  ["Baby corn", "kg", 1, 160],
  ["Baby corn (tin)", "pcs", 2, 140],
  // Meat, paneer, dairy
  ["Paneer", "kg", 2, 360],
  ["Chicken (whole, medium)", "pcs", 3, 250],
  ["Chicken (whole, small)", "pcs", 2, 180],
  ["Chicken (boneless)", "kg", 2, 280],
  ["Butter", "kg", 0.5, 520],
  ["Ghee", "kg", 0.5, 600],
  // Grocery (mudi)
  ["Atta", "kg", 10, 35],
  ["Rice (Nawazish)", "kg", 10, 70],
  ["Moong masoor dal", "kg", 2, 120],
  ["Besan", "kg", 1, 90],
  ["Cornflour", "kg", 1, 60],
  ["Chowmein noodles", "kg", 2, 100],
  ["Refined oil", "L", 5, 140],
  ["Sugar", "kg", 1, 45],
  ["Salt", "kg", 1, 25],
  ["Haldi powder", "kg", 0.25, 250],
  ["Jeera powder", "kg", 0.25, 450],
  ["Chicken masala", "kg", 0.2, 600],
  ["Kasuri methi", "kg", 0.1, 600],
  ["Honey", "kg", 0.2, 400],
  ["Tomato sauce", "kg", 1, 150],
  ["Achar (pickle)", "kg", 1, 200],
  ["Papad", "kg", 0.5, 300],
  // Parcel packing
  ["Container, small", "pcs", 20, 5],
  ["Container, big", "pcs", 20, 15],
  // Needed by the menu, not on the shopping lists
  ["Potato", "kg", 5, 25],
  ["Capsicum", "kg", 1, 60],
  ["Green peas", "kg", 1, 80],
  ["Sweet corn", "kg", 1, 100],
  ["Kabuli chana", "kg", 1, 110],
  ["Black dal (urad)", "kg", 1, 130],
  ["Maida", "kg", 5, 40],
  ["Mutton", "kg", 1, 750],
  ["Fish", "kg", 1, 300],
  ["Chicken liver (kaleji)", "kg", 0.5, 160],
  ["Eggs", "pcs", 30, 6],
  ["Fresh cream", "L", 0.5, 220],
  ["Curd", "kg", 1, 70],
  ["Milk", "L", 1, 60],
  ["Cheese", "kg", 0.25, 500],
  ["Cashew", "kg", 0.25, 900],
  ["Chinese sauces (soy/chilli)", "L", 0.5, 120],
  ["Water bottle", "pcs", 24, 10],
];

/** The first starting list (before the restaurant's real shopping list), to recognise it in older copies. */
export const OLD_STARTER_STOCK_NAMES = [
  "Paneer",
  "Chicken (boneless)",
  "Chicken (with bone)",
  "Chicken liver (kaleji)",
  "Mutton",
  "Fish",
  "Eggs",
  "Mushroom",
  "Baby corn",
  "Sweet corn",
  "Potato",
  "Onion",
  "Tomato",
  "Capsicum",
  "Cabbage",
  "Carrot",
  "Cauliflower",
  "Green peas",
  "Spinach (palak)",
  "Bhindi",
  "Basmati rice",
  "Atta",
  "Maida",
  "Besan",
  "Cornflour",
  "Hakka noodles",
  "Yellow dal",
  "Black dal (urad)",
  "Kabuli chana",
  "Cooking oil",
  "Butter",
  "Fresh cream",
  "Curd",
  "Milk",
  "Cheese",
  "Cashew",
  "Chinese sauces (soy/chilli)",
  "Papad",
  "Water bottle",
];

const UNIT = Object.fromEntries(STARTER_STOCK.map(([n, u]) => [n, u]));
/** Recipe unit: grams / ml / pieces. */
export const recipeUnit = (item: string) =>
  UNIT[item] === "kg" ? "g" : UNIT[item] === "L" ? "ml" : "pcs";

// ---------- building blocks (full portion) ----------

type Recipe = Record<string, number>;
const add = (...parts: Recipe[]): Recipe => {
  const out: Recipe = {};
  for (const p of parts) for (const [k, v] of Object.entries(p)) out[k] = (out[k] ?? 0) + v;
  return out;
};

const G = "Adrak (ginger)";
const L = "Lasun (garlic)";
const CHILLI = "Mirchi (green chilli)";
const DHANIYA = "Dhaniya patta (coriander)";

/** Salt, haldi, jeera, ginger, garlic, chilli and coriander for one Indian curry. */
const MASALA: Recipe = {
  Salt: 4,
  "Haldi powder": 1,
  "Jeera powder": 1,
  [G]: 5,
  [L]: 5,
  [CHILLI]: 3,
  [DHANIYA]: 3,
};
/** Onion-tomato base for Indian curries. */
const GRAVY: Recipe = add({ Onion: 80, "Tamatar (tomato)": 80, "Refined oil": 25 }, MASALA);
/** Rich makhani/butter base. */
const BUTTERY: Recipe = {
  Butter: 15,
  "Fresh cream": 25,
  Cashew: 10,
  "Tamatar (tomato)": 40,
  "Kasuri methi": 1,
  Sugar: 3,
};
/** Indo-Chinese toss. */
const CHINESE: Recipe = {
  Onion: 40,
  Capsicum: 40,
  "Refined oil": 30,
  Cornflour: 15,
  "Chinese sauces (soy/chilli)": 15,
  "Tomato sauce": 10,
  [G]: 3,
  [L]: 5,
  [CHILLI]: 5,
  Salt: 2,
  Sugar: 2,
};
const MIX_VEG: Recipe = {
  "Gajar (carrot)": 40,
  Beans: 30,
  "Green peas": 30,
  "Phool gobi (cauliflower)": 0.08,
  Potato: 40,
};
const SOUP_BASE: Recipe = {
  "Bandha gobi (cabbage)": 0.03,
  "Gajar (carrot)": 20,
  Beans: 10,
  Cornflour: 10,
  "Refined oil": 5,
  "Chinese sauces (soy/chilli)": 10,
  [G]: 2,
  [L]: 2,
  Salt: 2,
  Sugar: 1,
};
const FRIED_RICE: Recipe = {
  "Rice (Nawazish)": 150,
  "Bandha gobi (cabbage)": 0.04,
  "Gajar (carrot)": 30,
  Beans: 20,
  Capsicum: 20,
  Onion: 20,
  "Refined oil": 20,
  "Chinese sauces (soy/chilli)": 10,
  [L]: 3,
  Salt: 2,
};
const NOODLES: Recipe = {
  "Chowmein noodles": 150,
  "Bandha gobi (cabbage)": 0.06,
  "Gajar (carrot)": 30,
  Capsicum: 30,
  Onion: 30,
  "Refined oil": 25,
  "Chinese sauces (soy/chilli)": 15,
  "Tomato sauce": 5,
  [L]: 3,
  [CHILLI]: 2,
  Salt: 2,
};
/** Rice, 2 rotis, dal, a seasonal sabji (kumra / patal / potato) and achar. */
const THALI: Recipe = {
  "Rice (Nawazish)": 100,
  Atta: 100,
  "Moong masoor dal": 40,
  Potato: 40,
  "Kumra (pumpkin)": 40,
  "Patal (pointed gourd)": 30,
  Onion: 30,
  "Tamatar (tomato)": 30,
  "Refined oil": 15,
  "Achar (pickle)": 10,
  Salt: 4,
  "Haldi powder": 1,
  [CHILLI]: 2,
};
const TANDOORI_MARINADE: Recipe = {
  Curd: 60,
  "Refined oil": 15,
  [G]: 5,
  [L]: 5,
  Lemon: 0.25,
  Salt: 3,
  "Haldi powder": 1,
};

// ---------- every dish (name as on the menu, before Half/Full) ----------

export const STARTER_RECIPES: Record<string, Recipe> = {
  // Soup (Veg)
  "Veg Manchow": add(SOUP_BASE, { Capsicum: 15, "Chowmein noodles": 15 }),
  "Veg Hot & Sour": add(SOUP_BASE, { "Chinese sauces (soy/chilli)": 10 }),
  "Veg Sweet Corn": add(SOUP_BASE, { "Sweet corn": 50 }),
  "Veg Lemon Coriander": SOUP_BASE,
  "Veg Clear": { "Bandha gobi (cabbage)": 0.03, "Gajar (carrot)": 20, "Refined oil": 5 },
  "Veg Talumein": add(SOUP_BASE, { "Chowmein noodles": 30 }),
  "Mushroom Sweet Corn": add(SOUP_BASE, { "Mushroom (tin)": 0.07, "Sweet corn": 40 }),
  "Cream of Tomato": { "Tamatar (tomato)": 150, Butter: 5, "Fresh cream": 15, Cornflour: 5 },
  "Cream of Mushroom": { "Mushroom (tin)": 0.2, Milk: 100, Butter: 5, "Fresh cream": 15, Maida: 5 },
  "Veg Signature": add(SOUP_BASE, { "Mushroom (tin)": 0.05, "Baby corn": 20, Paneer: 20 }),
  // Soup (Non Veg)
  "Chicken Manchow": add(SOUP_BASE, {
    Capsicum: 15,
    "Chowmein noodles": 15,
    "Chicken (boneless)": 40,
  }),
  "Chicken Hot & Sour": add(SOUP_BASE, {
    "Chinese sauces (soy/chilli)": 10,
    "Chicken (boneless)": 40,
  }),
  "Chicken Sweet Corn": add(SOUP_BASE, { "Sweet corn": 40, "Chicken (boneless)": 40 }),
  "Chicken Lemon Coriander": add(SOUP_BASE, { "Chicken (boneless)": 40 }),
  "Chicken Clear": {
    "Bandha gobi (cabbage)": 0.03,
    "Gajar (carrot)": 20,
    "Refined oil": 5,
    "Chicken (boneless)": 40,
  },
  "Chicken Talumein": add(SOUP_BASE, { "Chowmein noodles": 30, "Chicken (boneless)": 40 }),
  "Cream of Chicken": {
    "Chicken (boneless)": 50,
    Milk: 100,
    Butter: 5,
    "Fresh cream": 15,
    Maida: 5,
  },
  "Chicken Signature": add(SOUP_BASE, { "Chicken (boneless)": 50, Eggs: 1 }),
  // Starter (Veg)
  "French Fries": { Potato: 250, "Refined oil": 40 },
  "Chilli Gobhi": add(CHINESE, { "Phool gobi (cauliflower)": 0.42, Maida: 30, Cornflour: 10 }),
  "Honey Chilli Potato": add(CHINESE, { Potato: 250, Cornflour: 10 }),
  "Veg Manchurian Dry": add(CHINESE, {
    "Bandha gobi (cabbage)": 0.12,
    "Gajar (carrot)": 60,
    Maida: 30,
    Cornflour: 5,
  }),
  "Veg Chilli": add(CHINESE, {
    "Bandha gobi (cabbage)": 0.1,
    "Gajar (carrot)": 50,
    Capsicum: 20,
    Maida: 25,
  }),
  "Crispy Chilli Chana": add(CHINESE, { "Kabuli chana": 100, Cornflour: 15 }),
  "Crispy Chilli Babycorn": add(CHINESE, { "Baby corn": 200, Cornflour: 15, Maida: 20 }),
  "Cheese Churmuri": { Potato: 150, Cheese: 50, Onion: 40, "Refined oil": 30 },
  "Crispy American Chilli": add(CHINESE, { "Sweet corn": 200, Cornflour: 25 }),
  "American Salt & Pepper": {
    "Sweet corn": 200,
    Cornflour: 40,
    Onion: 30,
    Capsicum: 30,
    "Refined oil": 40,
  },
  "Paneer Chilli Dry": add(CHINESE, { Paneer: 180, Cornflour: 10, Maida: 15 }),
  "Paneer Salt & Pepper": {
    Paneer: 180,
    Cornflour: 25,
    Onion: 30,
    Capsicum: 30,
    "Refined oil": 40,
  },
  "Paneer 65": { Paneer: 180, Cornflour: 25, Curd: 30, "Refined oil": 40 },
  "Spring Roll": {
    Maida: 60,
    "Bandha gobi (cabbage)": 0.1,
    "Gajar (carrot)": 40,
    Capsicum: 20,
    "Refined oil": 50,
    "Chinese sauces (soy/chilli)": 10,
  },
  "Onion Pakoda": { Onion: 200, Besan: 80, "Refined oil": 60 },
  "Paneer Pakoda": { Paneer: 150, Besan: 70, "Refined oil": 60 },
  // Starter (Non Veg)
  "Egg Chilli": add(CHINESE, { Eggs: 4, Cornflour: 5 }),
  "Fried Chicken": { "Chicken (whole, medium)": 0.25, Maida: 40, Cornflour: 20, "Refined oil": 60 },
  "Pot Kaleji Fry": { "Chicken liver (kaleji)": 250, Onion: 60, "Refined oil": 30 },
  "Chicken Lollipop": {
    "Chicken (whole, medium)": 0.3,
    Cornflour: 30,
    Maida: 20,
    "Refined oil": 80,
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
    "Refined oil": 50,
  },
  "Chicken Tai Pai": add(CHINESE, { "Chicken (boneless)": 250, Cornflour: 15 }),
  "Fish Chilli": add(CHINESE, { Fish: 250, Cornflour: 15 }),
  "Fish Fry (2 piece)": { Fish: 100, Besan: 30, "Refined oil": 40 },
  // Tandoori Starter (Veg)
  "Hara Bhara Kabab": {
    "Palak (spinach)": 100,
    "Green peas": 60,
    Potato: 100,
    Paneer: 30,
    Besan: 20,
    "Refined oil": 40,
  },
  "Corn Tikki": { "Sweet corn": 120, Potato: 120, Besan: 20, "Refined oil": 40 },
  "Paneer Tikka": add(TANDOORI_MARINADE, { Paneer: 200, Capsicum: 50, Onion: 50 }),
  "Paneer Haryali Tikka": add(TANDOORI_MARINADE, {
    Paneer: 200,
    "Palak (spinach)": 30,
    Capsicum: 40,
    Onion: 40,
  }),
  "Mushroom Tikka": add(TANDOORI_MARINADE, { "Mushroom (tin)": 0.5, Capsicum: 40, Onion: 40 }),
  "Tandoori Potato": add(TANDOORI_MARINADE, { Potato: 250 }),
  // Tandoori Starter (Non Veg)
  "Fish Tikka": add(TANDOORI_MARINADE, { Fish: 250 }),
  "Chuza Afghani Kabab": add(TANDOORI_MARINADE, {
    "Chicken (whole, small)": 0.5,
    "Fresh cream": 30,
    Cashew: 15,
  }),
  "Murg Haryali Kabab": add(TANDOORI_MARINADE, {
    "Chicken (boneless)": 250,
    "Palak (spinach)": 30,
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
    "Chicken (whole, small)": 1,
    Curd: 120,
    "Refined oil": 20,
    Butter: 10,
    [G]: 10,
    [L]: 10,
    Lemon: 0.5,
    Salt: 5,
  },
  "Murg Pahadi Kabab": {
    "Chicken (boneless)": 400,
    Curd: 80,
    "Palak (spinach)": 40,
    "Refined oil": 20,
  },
  // Chinese Main Course (Veg) — with gravy
  "Paneer Chilli": add(CHINESE, { Paneer: 150, Cornflour: 10 }),
  "Mushroom Chilli": add(CHINESE, { "Mushroom (tin)": 0.45, Cornflour: 10 }),
  "Veg Manchurian": add(CHINESE, {
    "Bandha gobi (cabbage)": 0.12,
    "Gajar (carrot)": 60,
    Maida: 30,
    Cornflour: 10,
  }),
  "Paneer Manchurian": add(CHINESE, { Paneer: 150, Maida: 15, Cornflour: 10 }),
  "Mushroom Manchurian": add(CHINESE, { "Mushroom (tin)": 0.45, Maida: 15, Cornflour: 10 }),
  // Chinese Main Course (Non Veg)
  "Chicken Chilli": add(CHINESE, { "Chicken (boneless)": 250, Cornflour: 10 }),
  "Ginger Chicken": add(CHINESE, { "Chicken (boneless)": 220, Cornflour: 10 }),
  "Chicken Manchurian": add(CHINESE, { "Chicken (boneless)": 220, Maida: 15, Cornflour: 10 }),
  "Hunan Chicken": add(CHINESE, { "Chicken (boneless)": 250, Cornflour: 10 }),
  // Noodles
  "Veg Hakka Noodles": NOODLES,
  "Veg Mix Hakka Noodles": add(NOODLES, { "Mushroom (tin)": 0.07, Paneer: 30, "Baby corn": 30 }),
  "Egg Hakka Noodles": add(NOODLES, { Eggs: 2 }),
  "Chicken Hakka Noodles": add(NOODLES, { "Chicken (boneless)": 100 }),
  "N-Veg Mix Hakka Noodles": add(NOODLES, { "Chicken (boneless)": 80, Eggs: 1 }),
  // Indian Main Course (Veg)
  "Yellow Dal Fry": {
    "Moong masoor dal": 80,
    Onion: 30,
    "Tamatar (tomato)": 30,
    "Refined oil": 15,
  },
  "Yellow Dal Tadka": {
    "Moong masoor dal": 80,
    Onion: 30,
    "Tamatar (tomato)": 30,
    "Refined oil": 10,
    Butter: 10,
  },
  "Dal Makhni": { "Black dal (urad)": 80, Butter: 25, "Fresh cream": 30, "Tamatar (tomato)": 60 },
  "Black Dal Tadka": {
    "Black dal (urad)": 80,
    Onion: 30,
    "Tamatar (tomato)": 40,
    "Refined oil": 15,
    Butter: 10,
  },
  "Veg Kofta": add(GRAVY, {
    "Lauki (bottle gourd)": 120,
    Potato: 40,
    Paneer: 50,
    Maida: 15,
    "Fresh cream": 20,
    Cashew: 10,
    "Refined oil": 30,
  }),
  "Aloo Matar Masala": add(GRAVY, { Potato: 150, "Green peas": 80 }),
  "Aloo Gobhi Matar": add(GRAVY, {
    Potato: 100,
    "Phool gobi (cauliflower)": 0.25,
    "Green peas": 50,
  }),
  "Chana Masala": add(GRAVY, { "Kabuli chana": 100 }),
  "Mix Veg": add(GRAVY, MIX_VEG, { Capsicum: 30 }),
  "Veg Hyderabadi": add(GRAVY, MIX_VEG, { "Palak (spinach)": 40, Cashew: 10 }),
  "Veg Kolhapuri": add(GRAVY, MIX_VEG),
  "Veg Jaipuri": add(GRAVY, MIX_VEG, { "Fresh cream": 20, Cashew: 10, Papad: 12 }),
  "Veg Jalfrezi": {
    "Gajar (carrot)": 50,
    Capsicum: 60,
    "Phool gobi (cauliflower)": 0.08,
    "Green peas": 30,
    Onion: 80,
    "Tamatar (tomato)": 60,
    "Refined oil": 25,
  },
  "Veg Kadhai": add(GRAVY, MIX_VEG, { Capsicum: 50 }),
  "Corn Palak": {
    "Sweet corn": 100,
    "Palak (spinach)": 200,
    Onion: 40,
    "Tamatar (tomato)": 30,
    "Fresh cream": 15,
    "Refined oil": 20,
  },
  "Bhindi Masala": { "Bhindi (vendi)": 250, Onion: 60, "Tamatar (tomato)": 50, "Refined oil": 30 },
  // Paneer Specialities
  "Paneer Masala": add(GRAVY, { Paneer: 150 }),
  "Paneer Butter Masala": add(GRAVY, BUTTERY, { Paneer: 150 }),
  "Paneer Tikka Butter Masala": add(GRAVY, BUTTERY, { Paneer: 180, Capsicum: 20, Curd: 30 }),
  "Paneer Pasanda": add(GRAVY, BUTTERY, { Paneer: 160, Cashew: 10 }),
  "Paneer Lababdar": add(GRAVY, BUTTERY, { Paneer: 150 }),
  "Paneer Mushroom Masala": add(GRAVY, { Paneer: 100, "Mushroom (tin)": 0.2 }),
  "Paneer Kadhai": add(GRAVY, { Paneer: 150, Capsicum: 50 }),
  "Paneer Hyderabadi": add(GRAVY, { Paneer: 150, "Palak (spinach)": 40, Cashew: 10 }),
  "Paneer Do Pyaza": add(GRAVY, { Paneer: 150, Onion: 80 }),
  "Palak Paneer": {
    Paneer: 120,
    "Palak (spinach)": 250,
    Onion: 40,
    "Tamatar (tomato)": 30,
    "Fresh cream": 15,
    "Refined oil": 20,
  },
  "Matar Paneer": add(GRAVY, { Paneer: 120, "Green peas": 80 }),
  "Paneer Chatpata": add(GRAVY, { Paneer: 150, Capsicum: 30 }),
  // Mushroom Specialities
  "Mushroom Masala": add(GRAVY, { "Mushroom (tin)": 0.45 }),
  "Mushroom Butter Masala": add(GRAVY, BUTTERY, { "Mushroom (tin)": 0.45 }),
  "Mushroom Kadhai": add(GRAVY, { "Mushroom (tin)": 0.45, Capsicum: 50 }),
  "Mushroom Do Pyaza": add(GRAVY, { "Mushroom (tin)": 0.45, Onion: 80 }),
  "Mushroom Matar Masala": add(GRAVY, { "Mushroom (tin)": 0.33, "Green peas": 70 }),
  // Egg Specialities (full = 2 eggs)
  "Egg Bhurji": { Eggs: 3, Onion: 40, "Tamatar (tomato)": 30, "Refined oil": 15, Butter: 5 },
  "Egg Curry": add(GRAVY, { Eggs: 2 }),
  "Egg Do Pyaza": add(GRAVY, { Eggs: 2, Onion: 80 }),
  "Egg Yellow Dal Tadka": {
    "Moong masoor dal": 80,
    Eggs: 2,
    Onion: 30,
    "Tamatar (tomato)": 30,
    "Refined oil": 15,
  },
  "Egg Black Dal Tadka": {
    "Black dal (urad)": 80,
    Eggs: 2,
    Onion: 30,
    "Tamatar (tomato)": 40,
    "Refined oil": 15,
    Butter: 10,
  },
  "Egg Masala": add(GRAVY, { Eggs: 2, Capsicum: 20 }),
  "Egg Omelette": { Eggs: 2, Onion: 30, "Refined oil": 10 },
  "Egg Omelette Curry": add(GRAVY, { Eggs: 2, "Refined oil": 10 }),
  // Fish Specialities (full = 4 pc)
  "Fish Curry": add(GRAVY, { Fish: 200, "Refined oil": 20 }),
  "Fish Do Pyaza": add(GRAVY, { Fish: 200, Onion: 80, "Refined oil": 20 }),
  "Fish Masala": add(GRAVY, { Fish: 200, Capsicum: 20, "Refined oil": 20 }),
  // Mutton Specialities (full = 4 pc)
  "Mutton Curry": add(GRAVY, { Mutton: 160, Curd: 30 }),
  "Mutton Masala": add(GRAVY, { Mutton: 160, Curd: 30, Onion: 30 }),
  "Mutton Rogan Josh": add(GRAVY, { Mutton: 160, Curd: 50 }),
  "Mutton Kassa": add(GRAVY, { Mutton: 160, Onion: 60, "Refined oil": 10 }),
  // Chicken Specialities (full = 4 pc)
  "Chicken Curry": add(GRAVY, { "Chicken (whole, medium)": 0.25 }),
  "Chicken Masala": add(GRAVY, { "Chicken (whole, medium)": 0.25, Capsicum: 20 }),
  "Chicken Hyderabadi": add(GRAVY, {
    "Chicken (whole, medium)": 0.25,
    "Palak (spinach)": 40,
    Cashew: 10,
  }),
  "Chicken Kolhapuri": add(GRAVY, { "Chicken (whole, medium)": 0.25 }),
  "Chicken Kadhai": add(GRAVY, { "Chicken (whole, medium)": 0.25, Capsicum: 50 }),
  "Chicken Do Pyaza": add(GRAVY, { "Chicken (whole, medium)": 0.25, Onion: 80 }),
  "Chicken Butter Masala": add(GRAVY, BUTTERY, { "Chicken (boneless)": 200 }),
  "Chicken Tikka Butter Masala": add(GRAVY, BUTTERY, { "Chicken (boneless)": 220, Curd: 40 }),
  "Chicken Kassa": add(GRAVY, { "Chicken (whole, medium)": 0.25, Onion: 60, "Refined oil": 10 }),
  "Chicken Lababdar": add(GRAVY, BUTTERY, { "Chicken (boneless)": 200 }),
  "Tandoori Chicken Masala": add(GRAVY, { "Chicken (whole, medium)": 0.3, Curd: 40, Butter: 10 }),
  "Pot Kaleji Masala": add(GRAVY, { "Chicken liver (kaleji)": 250 }),
  // Rice
  "Plain Rice": { "Rice (Nawazish)": 150 },
  "Jeera Rice": { "Rice (Nawazish)": 150, Butter: 10 },
  "Veg Fried Rice": FRIED_RICE,
  "Mixed Veg Fried Rice": add(FRIED_RICE, { "Mushroom (tin)": 0.07, Paneer: 30, "Baby corn": 30 }),
  "Peas Pulao": { "Rice (Nawazish)": 150, "Green peas": 60, Onion: 20, Butter: 10 },
  "Egg Fried Rice": add(FRIED_RICE, { Eggs: 2 }),
  "Kashmiri Pulao": { "Rice (Nawazish)": 150, Cashew: 15, Butter: 15, "Green peas": 30, Milk: 30 },
  "Chicken Fried Rice": add(FRIED_RICE, { "Chicken (boneless)": 100 }),
  "Mixed Non Veg Fried Rice": add(FRIED_RICE, { "Chicken (boneless)": 80, Eggs: 1 }),
  // Biryani
  "Veg Biryani": add(MIX_VEG, {
    "Rice (Nawazish)": 180,
    Onion: 60,
    Curd: 30,
    "Refined oil": 25,
    Butter: 10,
  }),
  "Egg Biryani": { "Rice (Nawazish)": 180, Eggs: 2, Onion: 60, Curd: 30, "Refined oil": 25 },
  "Chicken Biryani": {
    "Rice (Nawazish)": 180,
    "Chicken (whole, medium)": 0.25,
    Onion: 70,
    Curd: 40,
    "Refined oil": 30,
  },
  "Hyderabadi Chicken Biryani": {
    "Rice (Nawazish)": 180,
    "Chicken (whole, medium)": 0.25,
    Onion: 70,
    Curd: 40,
    "Refined oil": 30,
    Butter: 10,
  },
  "Chicken Tikka Biryani": {
    "Rice (Nawazish)": 180,
    "Chicken (boneless)": 220,
    Onion: 60,
    Curd: 50,
    "Refined oil": 30,
    Butter: 10,
  },
  "Mutton Biryani": {
    "Rice (Nawazish)": 180,
    Mutton: 150,
    Onion: 70,
    Curd: 50,
    "Refined oil": 30,
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
  "Plain Paratha": { Atta: 70, "Refined oil": 10 },
  "Aloo Paratha": { Atta: 80, Potato: 80, "Refined oil": 15 },
  "Paneer Paratha": { Atta: 80, Paneer: 40, "Refined oil": 15 },
  // Thali
  "Veg Thali": THALI,
  "Spl. Veg Thali": add(THALI, { Paneer: 60, Curd: 50, Papad: 12 }),
  "Egg Thali": add(THALI, { Eggs: 2 }),
  "Fish Thali": add(THALI, { Fish: 120 }),
  "Chicken Thali": add(THALI, { "Chicken (whole, medium)": 0.2 }),
  "Extra Rice": { "Rice (Nawazish)": 75 },
  "Extra Special Rice": { "Rice (Nawazish)": 75, Butter: 5 },
  "Extra Serving": { "Moong masoor dal": 30 },
  // Condiments
  "Green Salad": { Onion: 60, "Tamatar (tomato)": 60, "Gajar (carrot)": 40 },
  "Onion Salad": { Onion: 100 },
  "Fried Papad": { Papad: 12, "Refined oil": 10 },
  "Dry Papad": { Papad: 12 },
  "Masala Papad": { Papad: 12, Onion: 20, "Tamatar (tomato)": 20 },
  "Mix Raita": { Curd: 150, Onion: 20, "Tamatar (tomato)": 20 },
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

// ---------- dish-specific touches on top of the recipes above ----------

const CHICKEN_MASALA: Recipe = { "Chicken masala": 5 };
const DAL_TADKA: Recipe = {
  Salt: 3,
  "Haldi powder": 1,
  "Jeera powder": 1,
  [L]: 3,
  [CHILLI]: 2,
  [DHANIYA]: 2,
};
const LIGHT_MASALA: Recipe = {
  Salt: 3,
  "Haldi powder": 1,
  "Jeera powder": 1,
  [L]: 3,
  [CHILLI]: 2,
};
const FRY: Recipe = { Salt: 3, [G]: 5, [L]: 5 };

const EXTRAS: Record<string, Recipe> = {
  // Chicken and mutton curries, biryanis
  ...Object.fromEntries(
    [
      "Chicken Curry",
      "Chicken Masala",
      "Chicken Hyderabadi",
      "Chicken Kolhapuri",
      "Chicken Kadhai",
      "Chicken Do Pyaza",
      "Chicken Butter Masala",
      "Chicken Tikka Butter Masala",
      "Chicken Kassa",
      "Chicken Lababdar",
      "Tandoori Chicken Masala",
      "Pot Kaleji Masala",
      "Mutton Curry",
      "Mutton Masala",
      "Mutton Rogan Josh",
      "Mutton Kassa",
      "Chicken Thali",
    ].map((d) => [d, CHICKEN_MASALA]),
  ),
  ...Object.fromEntries(
    [
      "Chicken Biryani",
      "Hyderabadi Chicken Biryani",
      "Chicken Tikka Biryani",
      "Mutton Biryani",
    ].map((d) => [d, add(CHICKEN_MASALA, { Salt: 4, [G]: 3, [L]: 3 })]),
  ),
  "Veg Biryani": { Salt: 4, [G]: 3, [L]: 3 },
  "Egg Biryani": { Salt: 4, [G]: 3, [L]: 3 },
  // Dals
  "Yellow Dal Fry": DAL_TADKA,
  "Yellow Dal Tadka": add(DAL_TADKA, { Ghee: 5 }),
  "Black Dal Tadka": add(DAL_TADKA, { Ghee: 5 }),
  "Egg Yellow Dal Tadka": add(DAL_TADKA, { Ghee: 5 }),
  "Egg Black Dal Tadka": add(DAL_TADKA, { Ghee: 5 }),
  "Dal Makhni": { "Kasuri methi": 1, Salt: 3, [G]: 3, [L]: 3 },
  "Extra Serving": { Salt: 1 },
  // Vegetables without the curry base
  "Bhindi Masala": LIGHT_MASALA,
  "Corn Palak": LIGHT_MASALA,
  "Palak Paneer": LIGHT_MASALA,
  "Veg Jalfrezi": add(LIGHT_MASALA, { "Borboti (long beans)": 30 }),
  "Mix Veg": { "Borboti (long beans)": 20 },
  "Methi Matar Malai": { "Kasuri methi": 4, Salt: 3 },
  "Navratna Korma": { Salt: 3, Sugar: 3 },
  // Starters and sides
  "Honey Chilli Potato": { Honey: 15 },
  "Honey Chilli Chicken": { Honey: 15 },
  "Ginger Chicken": { [G]: 15 },
  "French Fries": { Salt: 2, "Tomato sauce": 15 },
  "Spring Roll": { Salt: 2, "Tomato sauce": 15 },
  "Onion Pakoda": { Salt: 3, [CHILLI]: 3, "Tomato sauce": 10 },
  "Paneer Pakoda": { Salt: 3, [CHILLI]: 3, "Tomato sauce": 10 },
  "Fish Fry (2 piece)": { Salt: 3, "Haldi powder": 1, [L]: 3, Lemon: 0.25 },
  "Fried Chicken": FRY,
  "Chicken Lollipop": FRY,
  "Pot Kaleji Fry": add(FRY, { "Haldi powder": 1, [CHILLI]: 3 }),
  "Hara Bhara Kabab": { Salt: 3, [CHILLI]: 3 },
  "Corn Tikki": { Salt: 3, [CHILLI]: 3 },
  "Cheese Churmuri": { Salt: 2, [CHILLI]: 2 },
  // Soups
  "Veg Lemon Coriander": { Lemon: 0.5, [DHANIYA]: 5 },
  "Chicken Lemon Coriander": { Lemon: 0.5, [DHANIYA]: 5 },
  "Cream of Tomato": { Sugar: 5, Salt: 2 },
  "Cream of Mushroom": { Salt: 2 },
  "Cream of Chicken": { Salt: 2 },
  // Eggs
  "Egg Bhurji": { Salt: 2, [CHILLI]: 2, [DHANIYA]: 2 },
  "Egg Omelette": { Salt: 2, [CHILLI]: 2, [DHANIYA]: 2 },
  // Rice, breads
  "Kashmiri Pulao": { Sugar: 5 },
  "Peas Pulao": { Salt: 3 },
  "Jeera Rice": { Salt: 2, "Jeera powder": 1 },
  "Garlic Butter Naan": { [L]: 5 },
  // Salads, papad, raita
  "Green Salad": { "Khira (cucumber)": 60, Lemon: 0.25, Salt: 1 },
  "Onion Salad": { Lemon: 0.25, [CHILLI]: 3, Salt: 1 },
  "Masala Papad": { [DHANIYA]: 2, [CHILLI]: 2 },
  "Mix Raita": { "Jeera powder": 1, Salt: 2, "Khira (cucumber)": 20 },
};
/** Rice dishes and biryanis are finished with ghee, not butter. */
const GHEE_NOT_BUTTER = [
  "Jeera Rice",
  "Peas Pulao",
  "Kashmiri Pulao",
  "Extra Special Rice",
  "Veg Biryani",
  "Hyderabadi Chicken Biryani",
  "Chicken Tikka Biryani",
  "Mutton Biryani",
];
for (const [dish, extra] of Object.entries(EXTRAS)) {
  if (!STARTER_RECIPES[dish]) throw new Error(`Starter recipe touch for unknown dish "${dish}"`);
  STARTER_RECIPES[dish] = add(STARTER_RECIPES[dish], extra);
}
for (const dish of GHEE_NOT_BUTTER) {
  const r = STARTER_RECIPES[dish]!;
  if (r.Butter) {
    r.Ghee = (r.Ghee ?? 0) + r.Butter;
    delete r.Butter;
  }
}

/** Rounds a recipe amount: whole grams/ml under 10, else to 5; pieces to 0.01. */
export const roundRecipeQty = (qty: number, unit: string) =>
  unit === "pcs"
    ? Math.max(0.01, Math.round(qty * 100) / 100)
    : qty < 10
      ? Math.max(1, Math.round(qty))
      : Math.round(qty / 5) * 5;

/** Adds the starting stock items (no stock yet) and the recipes of dishes found by name. */
export function seedStarterInventory(db: Database) {
  const at = now();
  const ids = new Map<string, string>();
  for (const [name, unit, warn, price] of STARTER_STOCK) {
    const existing = db
      .query<{ id: string }, { name: string }>(
        "SELECT id FROM inventory_items WHERE lower(name) = lower($name)",
      )
      .get({ name });
    if (existing) {
      ids.set(name, existing.id);
      continue;
    }
    const id = uuid();
    db.query(
      `INSERT INTO inventory_items (id, name, unit, current_quantity, low_stock_level, price_per_unit, is_active, created_at, updated_at)
       VALUES ($id, $name, $unit, 0, $warn, $price, 1, $at, $at)`,
    ).run({ id, name, unit, warn, price, at });
    ids.set(name, id);
  }
  for (const [dish, recipe] of Object.entries(STARTER_RECIPES)) {
    const item = db
      .query<{ id: string }, { name: string }>("SELECT id FROM menu_items WHERE name = $name")
      .get({ name: dish });
    if (!item) continue;
    const hasRecipe = db
      .query("SELECT 1 FROM menu_item_ingredients WHERE menu_item_id = $id")
      .get({ id: item.id });
    if (hasRecipe) continue;
    for (const [stock, qty] of Object.entries(recipe)) {
      const unit = recipeUnit(stock);
      db.query(
        `INSERT INTO menu_item_ingredients (id, menu_item_id, inventory_item_id, quantity, unit)
         VALUES ($id, $m, $inv, $q, $u)`,
      ).run({
        id: uuid(),
        m: item.id,
        inv: ids.get(stock)!,
        q: roundRecipeQty(qty, unit),
        u: unit,
      });
    }
  }
}
