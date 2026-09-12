-- Allow admin to insert restaurant tables (for in-app starter setup).

GRANT INSERT ON public.restaurant_tables TO authenticated;

CREATE POLICY "admin insert tables" ON public.restaurant_tables
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
