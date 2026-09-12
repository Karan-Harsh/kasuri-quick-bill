-- Organization settings (singleton) and per-bill GST snapshot.

CREATE TABLE public.organization_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL DEFAULT 'Kasuri',
  gst_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.organization_settings (id, name, gst_enabled)
VALUES (1, 'Kasuri', false)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.organization_settings TO authenticated;
GRANT UPDATE (gst_enabled, updated_at) ON public.organization_settings TO authenticated;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read organization settings"
  ON public.organization_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin update organization settings"
  ON public.organization_settings FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gst_applied boolean NOT NULL DEFAULT true;

-- Whether public self-signup should be offered (first admin bootstraps via signup).
CREATE OR REPLACE FUNCTION public.has_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin');
$$;

REVOKE ALL ON FUNCTION public.has_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_admin() TO anon, authenticated, service_role;
