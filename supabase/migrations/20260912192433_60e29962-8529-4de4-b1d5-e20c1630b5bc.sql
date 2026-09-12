CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY "admin insert categories" ON public.categories;
DROP POLICY "admin update categories" ON public.categories;
DROP POLICY "admin delete categories" ON public.categories;
DROP POLICY "admin insert menu" ON public.menu_items;
DROP POLICY "admin update menu" ON public.menu_items;
DROP POLICY "admin delete menu" ON public.menu_items;

CREATE POLICY "admin insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update categories" ON public.categories FOR UPDATE TO authenticated USING (private.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete categories" ON public.categories FOR DELETE TO authenticated USING (private.has_role(auth.uid(),'admin'));
CREATE POLICY "admin insert menu" ON public.menu_items FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update menu" ON public.menu_items FOR UPDATE TO authenticated USING (private.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete menu" ON public.menu_items FOR DELETE TO authenticated USING (private.has_role(auth.uid(),'admin'));

DROP FUNCTION public.has_role(uuid, public.app_role);

CREATE OR REPLACE FUNCTION private.claim_staff_role()
RETURNS public.app_role LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  existing public.app_role;
  assigned public.app_role;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT role INTO existing FROM public.user_roles WHERE user_id = uid LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    assigned := 'cashier';
  ELSE
    assigned := 'admin';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, assigned)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN assigned;
END;
$$;
REVOKE ALL ON FUNCTION private.claim_staff_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.claim_staff_role() TO authenticated, service_role;
DROP FUNCTION public.claim_staff_role();

-- Public wrapper the app calls: plain invoker function, so it is not a
-- SECURITY DEFINER surface itself.
CREATE OR REPLACE FUNCTION public.claim_staff_role()
RETURNS public.app_role LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT private.claim_staff_role();
$$;
REVOKE ALL ON FUNCTION public.claim_staff_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_staff_role() TO authenticated;

REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon;