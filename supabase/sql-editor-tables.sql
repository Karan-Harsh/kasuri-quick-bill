-- Run once in Supabase → SQL Editor if tables are missing on the dashboard.

INSERT INTO public.restaurant_tables (table_number, label) VALUES
  (1, 'T1'), (2, 'T2'), (3, 'T3'), (4, 'T4'),
  (5, 'T5'), (6, 'T6'), (7, 'T7'), (8, 'T8')
ON CONFLICT (table_number) DO NOTHING;
