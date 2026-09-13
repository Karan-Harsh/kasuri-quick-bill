-- Phase A: ready-to-serve signal on the table board.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS kitchen_ready_at timestamptz;

CREATE INDEX orders_kitchen_ready_idx ON public.orders (kitchen_ready_at)
  WHERE kitchen_ready_at IS NOT NULL AND status = 'OPEN';

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

  UPDATE public.orders
  SET kitchen_ready_at = NULL
  WHERE id = p_order_id;

  RETURN v_ticket_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_kitchen_ticket(p_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.kitchen_tickets
  SET status = 'DONE', completed_at = now()
  WHERE id = p_ticket_id AND status = 'OPEN'
  RETURNING order_id INTO v_order_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Ticket not found or already done';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.kitchen_tickets
    WHERE order_id = v_order_id AND status = 'OPEN'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = v_order_id AND kitchen_sent_at IS NULL
  ) THEN
    UPDATE public.orders
    SET kitchen_ready_at = now()
    WHERE id = v_order_id AND status = 'OPEN';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_kitchen_ready(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.orders
  SET kitchen_ready_at = NULL
  WHERE id = p_order_id
    AND status = 'OPEN'
    AND kitchen_ready_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order is not waiting to be served';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.acknowledge_kitchen_ready(uuid) TO authenticated;
