// Kasuri Family Restaurant's menu (from "Kasuri Family Restaurant Food menu update-1.pdf").
// New databases start with it, and "Load starter menu" adds it. Prices are before GST.
// [dish, half price or null, full price]: a dish sold in two sizes is one dish with a half price;
// the cashier or waiter picks Half or Full when ordering.
// Not included: Cold Drink (sold at M.R.P., so it has no fixed price).

export type StarterDish = [name: string, half: number | null, full: number];

export const KASURI_MENU: { category: string; dishes: StarterDish[] }[] = [
  {
    category: "Soup (Veg)",
    dishes: [
      ["Veg Manchow", null, 90],
      ["Veg Hot & Sour", null, 90],
      ["Veg Sweet Corn", null, 90],
      ["Veg Lemon Coriander", null, 90],
      ["Veg Clear", null, 90],
      ["Veg Talumein", null, 90],
      ["Mushroom Sweet Corn", null, 90],
      ["Cream of Tomato", null, 90],
      ["Cream of Mushroom", null, 90],
      ["Veg Signature", null, 120],
    ],
  },
  {
    category: "Soup (Non Veg)",
    dishes: [
      ["Chicken Manchow", null, 120],
      ["Chicken Hot & Sour", null, 120],
      ["Chicken Sweet Corn", null, 120],
      ["Chicken Lemon Coriander", null, 120],
      ["Chicken Clear", null, 120],
      ["Chicken Talumein", null, 120],
      ["Cream of Chicken", null, 120],
      ["Chicken Signature", null, 140],
    ],
  },
  {
    category: "Starter (Veg)",
    dishes: [
      ["French Fries", null, 140],
      ["Chilli Gobhi", null, 150],
      ["Honey Chilli Potato", null, 160],
      ["Veg Manchurian Dry", null, 170],
      ["Veg Chilli", null, 190],
      ["Crispy Chilli Chana", null, 180],
      ["Crispy Chilli Babycorn", null, 180],
      ["Cheese Churmuri", null, 190],
      ["Crispy American Chilli", null, 180],
      ["American Salt & Pepper", null, 180],
      ["Paneer Chilli Dry", null, 190],
      ["Paneer Salt & Pepper", null, 190],
      ["Paneer 65", null, 190],
      ["Spring Roll", null, 180],
      ["Onion Pakoda", null, 100],
      ["Paneer Pakoda", null, 180],
    ],
  },
  {
    category: "Starter (Non Veg)",
    dishes: [
      ["Egg Chilli", null, 150],
      ["Fried Chicken", null, 160],
      ["Pot Kaleji Fry", null, 170],
      ["Chicken Lollipop", null, 190],
      ["Crispy Chilli Chicken Dry", 150, 220],
      ["Honey Chilli Chicken", null, 210],
      ["Chicken Salt & Pepper", null, 210],
      ["Chicken Tai Pai", null, 220],
      ["Fish Chilli", null, 210],
      ["Fish Fry (2 piece)", null, 80],
    ],
  },
  {
    category: "Tandoori Starter (Veg)",
    dishes: [
      ["Hara Bhara Kabab", null, 200],
      ["Corn Tikki", null, 170],
      ["Paneer Tikka", null, 180],
      ["Paneer Haryali Tikka", null, 190],
      ["Mushroom Tikka", null, 190],
      ["Tandoori Potato", null, 180],
    ],
  },
  {
    category: "Tandoori Starter (Non Veg)",
    dishes: [
      ["Fish Tikka", null, 230],
      ["Chuza Afghani Kabab", null, 220],
      ["Murg Haryali Kabab", null, 220],
      ["Chicken Tikka", null, 210],
      ["Murg Malai Kabab", null, 220],
      ["Murg Aachari Tikka", null, 220],
      ["Murg Lasuni Kabab", null, 220],
      ["Murg Banjara Kabab", null, 220],
      ["Tandoori Chicken", 220, 380],
      ["Murg Pahadi Kabab", 230, 450],
    ],
  },
  {
    category: "Chinese Main Course (Veg)",
    dishes: [
      ["Paneer Chilli", 130, 190],
      ["Mushroom Chilli", 130, 190],
      ["Veg Manchurian", 120, 170],
      ["Paneer Manchurian", 140, 200],
      ["Mushroom Manchurian", 150, 220],
    ],
  },
  {
    category: "Chinese Main Course (Non Veg)",
    dishes: [
      ["Chicken Chilli", 150, 220],
      ["Ginger Chicken", 130, 190],
      ["Chicken Manchurian", 140, 200],
      ["Hunan Chicken", 150, 220],
    ],
  },
  {
    category: "Noodles",
    dishes: [
      ["Veg Hakka Noodles", 120, 170],
      ["Veg Mix Hakka Noodles", 150, 190],
      ["Egg Hakka Noodles", 130, 180],
      ["Chicken Hakka Noodles", 140, 200],
      ["N-Veg Mix Hakka Noodles", 150, 220],
    ],
  },
  {
    category: "Indian Main Course (Veg)",
    dishes: [
      ["Yellow Dal Fry", 80, 120],
      ["Yellow Dal Tadka", 100, 150],
      ["Dal Makhni", null, 180],
      ["Black Dal Tadka", 110, 170],
      ["Veg Kofta", null, 170],
      ["Aloo Matar Masala", 100, 160],
      ["Aloo Gobhi Matar", 120, 180],
      ["Chana Masala", 100, 160],
      ["Mix Veg", 120, 180],
      ["Veg Hyderabadi", null, 180],
      ["Veg Kolhapuri", null, 190],
      ["Veg Jaipuri", null, 200],
      ["Veg Jalfrezi", null, 170],
      ["Veg Kadhai", null, 170],
      ["Corn Palak", null, 180],
      ["Bhindi Masala", null, 130],
    ],
  },
  {
    category: "Paneer Specialities",
    dishes: [
      ["Paneer Masala", 120, 180],
      ["Paneer Butter Masala", 130, 190],
      ["Paneer Tikka Butter Masala", null, 210],
      ["Paneer Pasanda", null, 200],
      ["Paneer Lababdar", 130, 190],
      ["Paneer Mushroom Masala", 140, 200],
      ["Paneer Kadhai", 120, 180],
      ["Paneer Hyderabadi", 120, 180],
      ["Paneer Do Pyaza", 120, 180],
      ["Palak Paneer", 140, 200],
      ["Matar Paneer", 140, 200],
      ["Paneer Chatpata", 140, 200],
    ],
  },
  {
    category: "Mushroom Specialities",
    dishes: [
      ["Mushroom Masala", 120, 180],
      ["Mushroom Butter Masala", 130, 190],
      ["Mushroom Kadhai", 130, 190],
      ["Mushroom Do Pyaza", 130, 190],
      ["Mushroom Matar Masala", 140, 200],
    ],
  },
  {
    category: "Egg Specialities",
    dishes: [
      ["Egg Bhurji", null, 80],
      ["Egg Curry", null, 100],
      ["Egg Do Pyaza", null, 120],
      ["Egg Yellow Dal Tadka", 110, 150],
      ["Egg Black Dal Tadka", 130, 190],
      ["Egg Masala", null, 120],
      ["Egg Omelette", null, 80],
      ["Egg Omelette Curry", null, 140],
    ],
  },
  {
    category: "Fish Specialities",
    dishes: [
      ["Fish Curry", 110, 170],
      ["Fish Do Pyaza", 120, 180],
      ["Fish Masala", 130, 190],
    ],
  },
  {
    category: "Mutton Specialities",
    dishes: [
      ["Mutton Curry", 150, 260],
      ["Mutton Masala", 170, 280],
      ["Mutton Rogan Josh", 170, 280],
      ["Mutton Kassa", 190, 290],
    ],
  },
  {
    category: "Chicken Specialities",
    dishes: [
      ["Chicken Curry", 120, 180],
      ["Chicken Masala", 140, 190],
      ["Chicken Hyderabadi", null, 190],
      ["Chicken Kolhapuri", null, 190],
      ["Chicken Kadhai", 140, 190],
      ["Chicken Do Pyaza", 140, 190],
      ["Chicken Butter Masala", 140, 200],
      ["Chicken Tikka Butter Masala", null, 210],
      ["Chicken Kassa", 150, 200],
      ["Chicken Lababdar", 140, 190],
      ["Tandoori Chicken Masala", 160, 210],
      ["Pot Kaleji Masala", null, 200],
    ],
  },
  {
    category: "Rice",
    dishes: [
      ["Plain Rice", 60, 100],
      ["Jeera Rice", 70, 120],
      ["Veg Fried Rice", 100, 170],
      ["Mixed Veg Fried Rice", 130, 200],
      ["Peas Pulao", 120, 170],
      ["Egg Fried Rice", 140, 180],
      ["Kashmiri Pulao", null, 180],
      ["Chicken Fried Rice", 150, 220],
      ["Mixed Non Veg Fried Rice", 170, 230],
    ],
  },
  {
    category: "Biryani",
    dishes: [
      ["Veg Biryani", 100, 170],
      ["Egg Biryani", null, 150],
      ["Chicken Biryani", 120, 220],
      ["Hyderabadi Chicken Biryani", null, 240],
      ["Chicken Tikka Biryani", null, 280],
      ["Mutton Biryani", null, 310],
    ],
  },
  {
    category: "Breads",
    dishes: [
      ["Tawa Roti", null, 10],
      ["Butter Tawa Roti", null, 15],
      ["Tandoori Roti", null, 15],
      ["Butter Tandoori Roti", null, 20],
      ["Naan", null, 30],
      ["Butter Naan", null, 35],
      ["Garlic Butter Naan", null, 40],
      ["Masala Kulcha", null, 40],
      ["Kashmiri Naan", null, 45],
      ["Punjabi Naan", null, 45],
      ["Stuffed Naan", null, 45],
      ["Cheese Naan", null, 50],
      ["Plain Paratha", null, 25],
      ["Aloo Paratha", null, 35],
      ["Paneer Paratha", null, 45],
    ],
  },
  {
    category: "Thali",
    dishes: [
      ["Veg Thali", null, 80],
      ["Spl. Veg Thali", null, 100],
      ["Egg Thali", null, 100],
      ["Fish Thali", null, 120],
      ["Chicken Thali", null, 150],
      ["Extra Rice", null, 20],
      ["Extra Special Rice", null, 40],
      ["Extra Serving", null, 10],
    ],
  },
  {
    category: "Condiments",
    dishes: [
      ["Green Salad", null, 50],
      ["Onion Salad", null, 40],
      ["Fried Papad", null, 20],
      ["Dry Papad", null, 20],
      ["Masala Papad", null, 40],
      ["Mix Raita", null, 40],
      ["Plain Curd", null, 30],
      ["Water", null, 20],
    ],
  },
  {
    category: "Pure Veg Specials",
    dishes: [
      ["Shahi Paneer", null, 230],
      ["Methi Matar Malai", null, 230],
      ["Navratna Korma", null, 240],
    ],
  },
];

/** The small demo menu earlier versions started with. Still used by the tests, and recognised so an
 *  untouched demo menu can be replaced by the real one (see db.ts). */
export const DEMO_MENU: { category: string; dishes: StarterDish[] }[] = [
  {
    category: "Starters",
    dishes: [
      ["Paneer Tikka", null, 220],
      ["Chicken 65", null, 260],
      ["Veg Manchurian", null, 180],
      ["Masala Papad", null, 60],
      ["Spring Roll", null, 150],
    ],
  },
  {
    category: "Main Course",
    dishes: [
      ["Paneer Butter Masala", null, 260],
      ["Dal Tadka", null, 180],
      ["Chicken Curry", null, 290],
      ["Mixed Veg Kadai", null, 220],
      ["Palak Paneer", null, 240],
    ],
  },
  {
    category: "Breads",
    dishes: [
      ["Tandoori Roti", null, 20],
      ["Butter Naan", null, 45],
      ["Garlic Naan", null, 60],
      ["Laccha Paratha", null, 55],
    ],
  },
  {
    category: "Beverages",
    dishes: [
      ["Masala Chai", null, 30],
      ["Fresh Lime Soda", null, 70],
      ["Cold Coffee", null, 120],
      ["Mango Lassi", null, 90],
    ],
  },
];

/** GST rates of demo dishes that weren't 5%. */
export const DEMO_TAX: Record<string, number> = { "Fresh Lime Soda": 18, "Cold Coffee": 18 };

/** Every dish of a menu as it appears in the app: name, category, price and half price. */
export function flattenMenu(menu: { category: string; dishes: StarterDish[] }[]) {
  return menu.flatMap(({ category, dishes }) =>
    dishes.map(([name, half, full]) => ({ category, name, price: full, half_price: half })),
  );
}
