CREATE TYPE public.app_role AS ENUM ('admin','cashier');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- First signed-in staff member becomes admin, everyone after that a cashier.
CREATE OR REPLACE FUNCTION public.claim_staff_role()
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
GRANT EXECUTE ON FUNCTION public.claim_staff_role() TO authenticated;

CREATE TABLE public.restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number int NOT NULL UNIQUE,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.restaurant_tables TO authenticated;
GRANT ALL ON public.restaurant_tables TO service_role;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read tables" ON public.restaurant_tables FOR SELECT TO authenticated USING (true);

INSERT INTO public.restaurant_tables (table_number, label) VALUES
 (1,'T1'),(2,'T2'),(3,'T3'),(4,'T4'),(5,'T5'),(6,'T6'),(7,'T7'),(8,'T8');

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update categories" ON public.categories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete categories" ON public.categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  tax_rate numeric(5,2) NOT NULL DEFAULT 5 CHECK (tax_rate >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read menu" ON public.menu_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin insert menu" ON public.menu_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update menu" ON public.menu_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete menu" ON public.menu_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER menu_items_touch BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE SEQUENCE public.bill_number_seq START 1001;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number bigint NOT NULL UNIQUE DEFAULT nextval('public.bill_number_seq'),
  order_type text NOT NULL CHECK (order_type IN ('DINE_IN','PARCEL')),
  table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','CANCELLED')),
  discount numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text CHECK (payment_method IN ('CASH','UPI','CARD')),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage orders" ON public.orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE UNIQUE INDEX one_open_order_per_table ON public.orders (table_id) WHERE status = 'OPEN' AND table_id IS NOT NULL;
CREATE INDEX orders_created_at_idx ON public.orders (created_at);
CREATE INDEX orders_status_idx ON public.orders (status);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage order items" ON public.order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX order_items_order_idx ON public.order_items (order_id);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('CASH','UPI','CARD')),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  paid_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage payments" ON public.payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX payments_order_idx ON public.payments (order_id);

INSERT INTO public.categories (name, sort_order) VALUES
 ('Starters',1),('Main Course',2),('Breads',3),('Rice & Biryani',4),('Beverages',5),('Desserts',6);

INSERT INTO public.menu_items (category_id, name, price, tax_rate)
SELECT c.id, x.name, x.price, x.tax FROM public.categories c
JOIN (VALUES
 ('Starters','Paneer Tikka',220,5),
 ('Starters','Veg Manchurian',180,5),
 ('Starters','Chicken 65',260,5),
 ('Starters','Masala Papad',60,5),
 ('Main Course','Paneer Butter Masala',260,5),
 ('Main Course','Dal Tadka',180,5),
 ('Main Course','Chicken Curry',290,5),
 ('Main Course','Mixed Veg Kadai',220,5),
 ('Breads','Tandoori Roti',20,5),
 ('Breads','Butter Naan',45,5),
 ('Breads','Garlic Naan',60,5),
 ('Rice & Biryani','Veg Biryani',210,5),
 ('Rice & Biryani','Chicken Biryani',280,5),
 ('Rice & Biryani','Jeera Rice',150,5),
 ('Beverages','Masala Chai',30,5),
 ('Beverages','Fresh Lime Soda',70,18),
 ('Beverages','Cold Coffee',120,18),
 ('Desserts','Gulab Jamun',80,5),
 ('Desserts','Gajar Halwa',110,5)
) AS x(cat,name,price,tax) ON x.cat = c.name;