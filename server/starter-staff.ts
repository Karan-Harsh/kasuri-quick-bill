// Kasuri's staff, added when the app creates a brand-new database (a fresh install).
// Each is paid a month from the day they joined (Settings → Salary rules).
// Leaves allowed per month weren't given; 2 is the form's default — change it per person in Staff.

export const KASURI_STAFF: {
  name: string;
  role: string;
  join_date: string;
  monthly_salary: number;
}[] = [
  { name: "Bishnu", role: "Head chef", join_date: "2026-05-17", monthly_salary: 24000 },
  { name: "Bijoy", role: "Chef", join_date: "2026-09-16", monthly_salary: 17000 },
  { name: "Bidhan", role: "Helper cook", join_date: "2026-05-21", monthly_salary: 11000 },
  { name: "Rupchand", role: "Waiter", join_date: "2026-06-10", monthly_salary: 11000 },
  { name: "Dipankar", role: "Waiter", join_date: "2026-06-15", monthly_salary: 9000 },
  { name: "Chiranjeet", role: "Cleaner", join_date: "2026-06-19", monthly_salary: 7500 },
  { name: "Ranjeet", role: "Cleaner", join_date: "2026-09-30", monthly_salary: 8000 },
];

export const STARTER_ALLOWED_LEAVES = 2;
