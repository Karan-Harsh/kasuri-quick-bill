-- Kitchen order tickets (KOT): print slips + kitchen display screen.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'kitchen';

CREATE SEQUENCE public.kot_number_seq START 1;

CREATE TABLE public.kitchen_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kot_number bigint NOT NULL UNIQUE DEFAULT nextval('public.kot_number_seq'),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DONE')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid,
  completed_at timestamptz
);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS kitchen_ticket_id uuid REFERENCES public.kitchen_tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kitchen_sent_at timestamptz;

CREATE INDEX kitchen_tickets_open_idx ON public.kitchen_tickets (sent_at DESC) WHERE status = 'OPEN';
CREATE INDEX kitchen_tickets_order_idx ON public.kitchen_tickets (order_id);
CREATE INDEX order_items_kitchen_ticket_idx ON public.order_items (kitchen_ticket_id);

GRANT SELECT, UPDATE ON public.kitchen_tickets TO authenticated;
GRANT ALL ON public.kitchen_tickets TO service_role;
ALTER TABLE public.kitchen_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read kitchen tickets"
  ON public.kitchen_tickets FOR SELECT TO authenticated USING (true);

CREATE POLICY "staff update kitchen tickets"
  ON public.kitchen_tickets FOR UPDATE TO authenticated USING (true);

-- Creates a ticket for all order lines not yet sent to the kitchen.
CREATE OR REPLACE FUNCTION public.send_order_to_kitchen(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id uuid;
  v_pending int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = p_order_id AND status = 'OPEN'
  ) THEN
    RAISE EXCEPTION 'Order is not open';
  END IF;

  SELECT COUNT(*) INTO v_pending
  FROM public.order_items
  WHERE order_id = p_order_id AND kitchen_sent_at IS NULL;

  IF v_pending = 0 THEN
    RAISE EXCEPTION 'No new items to send to kitchen';
  END IF;

  INSERT INTO public.kitchen_tickets (order_id, sent_by)
  VALUES (p_order_id, auth.uid())
  RETURNING id INTO v_ticket_id;

  UPDATE public.order_items
  SET kitchen_ticket_id = v_ticket_id, kitchen_sent_at = now()
  WHERE order_id = p_order_id AND kitchen_sent_at IS NULL;

  RETURN v_ticket_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_order_to_kitchen(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_kitchen_ticket(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.kitchen_tickets
  SET status = 'DONE', completed_at = now()
  WHERE id = p_ticket_id AND status = 'OPEN';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found or already done';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_kitchen_ticket(uuid) TO authenticated;
