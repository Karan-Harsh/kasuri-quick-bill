-- Kitchen inventory: track stock levels and nightly usage/counts.

CREATE TYPE public.inventory_movement_type AS ENUM ('used', 'received', 'count');

CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  unit text NOT NULL DEFAULT 'kg',
  current_quantity numeric(12, 3) NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  movement_type public.inventory_movement_type NOT NULL,
  quantity_change numeric(12, 3) NOT NULL,
  quantity_after numeric(12, 3) NOT NULL CHECK (quantity_after >= 0),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventory_movements_item_idx ON public.inventory_movements (item_id, created_at DESC);

GRANT SELECT ON public.inventory_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
GRANT ALL ON public.inventory_movements TO service_role;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read inventory items"
  ON public.inventory_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin insert inventory items"
  ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin update inventory items"
  ON public.inventory_items FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin delete inventory items"
  ON public.inventory_items FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "staff read inventory movements"
  ON public.inventory_movements FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin insert inventory movements"
  ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE TRIGGER inventory_items_touch
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.record_inventory_movement(
  p_item_id uuid,
  p_movement_type public.inventory_movement_type,
  p_quantity numeric,
  p_note text DEFAULT NULL
)
RETURNS public.inventory_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  item public.inventory_items;
  delta numeric(12, 3);
  next_qty numeric(12, 3);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT private.has_role(uid, 'admin') THEN RAISE EXCEPTION 'admin only'; END IF;
  IF p_quantity IS NULL OR p_quantity < 0 THEN RAISE EXCEPTION 'quantity must be zero or positive'; END IF;

  SELECT * INTO item FROM public.inventory_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory item not found'; END IF;

  IF p_movement_type = 'count' THEN
    next_qty := round(p_quantity::numeric, 3);
    delta := next_qty - item.current_quantity;
  ELSIF p_movement_type = 'used' THEN
    IF p_quantity = 0 THEN RAISE EXCEPTION 'used quantity must be greater than zero'; END IF;
    delta := -round(p_quantity::numeric, 3);
    next_qty := round(item.current_quantity + delta, 3);
  ELSE
    IF p_quantity = 0 THEN RAISE EXCEPTION 'received quantity must be greater than zero'; END IF;
    delta := round(p_quantity::numeric, 3);
    next_qty := round(item.current_quantity + delta, 3);
  END IF;

  IF next_qty < 0 THEN
    RAISE EXCEPTION 'not enough stock (have % %)', item.current_quantity, item.unit;
  END IF;

  UPDATE public.inventory_items
  SET current_quantity = next_qty, updated_at = now()
  WHERE id = p_item_id
  RETURNING * INTO item;

  INSERT INTO public.inventory_movements (
    item_id, movement_type, quantity_change, quantity_after, note, created_by
  ) VALUES (
    p_item_id, p_movement_type, delta, next_qty, nullif(trim(p_note), ''), uid
  );

  RETURN item;
END;
$$;

REVOKE ALL ON FUNCTION public.record_inventory_movement(uuid, public.inventory_movement_type, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_inventory_movement(uuid, public.inventory_movement_type, numeric, text) TO authenticated;
