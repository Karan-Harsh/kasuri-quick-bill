export type KitchenTicketStatus = "OPEN" | "DONE";

export interface KitchenTicketLine {
  id: string;
  item_name: string;
  quantity: number;
}

export interface KitchenTicketSummary {
  id: string;
  kot_number: number;
  status: KitchenTicketStatus;
  sent_at: string;
  completed_at: string | null;
  order_id: string;
  bill_number: number;
  order_type: string;
  table_label: string | null;
  lines: KitchenTicketLine[];
}

export function kitchenLocationLabel(ticket: {
  order_type: string;
  table_label: string | null;
  bill_number: number;
}) {
  if (ticket.order_type === "PARCEL") return `Parcel · Bill #${ticket.bill_number}`;
  if (ticket.table_label) return `Table ${ticket.table_label}`;
  return `Bill #${ticket.bill_number}`;
}

export function formatKitchenTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ticketAgeMinutes(sentAt: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(sentAt).getTime()) / 60_000));
}

export function formatTicketAge(sentAt: string, now = Date.now()) {
  const minutes = ticketAgeMinutes(sentAt, now);
  if (minutes < 1) return "Just now";
  if (minutes === 1) return "1 min";
  return `${minutes} min`;
}

export type TicketAgeLevel = "fresh" | "waiting" | "late";

export function ticketAgeLevel(sentAt: string, now = Date.now()): TicketAgeLevel {
  const minutes = ticketAgeMinutes(sentAt, now);
  if (minutes >= 20) return "late";
  if (minutes >= 10) return "waiting";
  return "fresh";
}

const TICKET_AGE_STYLES: Record<
  TicketAgeLevel,
  { card: string; badge: string; label: string }
> = {
  fresh: {
    card: "border-available/50 bg-card",
    badge: "bg-available/15 text-available",
    label: "New",
  },
  waiting: {
    card: "border-amber-500 bg-card",
    badge: "bg-amber-500/15 text-amber-800",
    label: "Waiting",
  },
  late: {
    card: "border-destructive bg-card animate-pulse",
    badge: "bg-destructive/15 text-destructive",
    label: "Late",
  },
};

export function ticketAgeStyles(sentAt: string, now = Date.now()) {
  return TICKET_AGE_STYLES[ticketAgeLevel(sentAt, now)];
}

let kitchenAlertContext: AudioContext | null = null;

/** Short chime when a new KOT lands on the kitchen screen. */
export function playKitchenAlert() {
  if (typeof window === "undefined") return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    kitchenAlertContext ??= new AudioContextClass();
    const ctx = kitchenAlertContext;
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    gain.connect(ctx.destination);

    [880, 1175].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      const start = now + index * 0.12;
      oscillator.start(start);
      oscillator.stop(start + 0.22);
    });
  } catch {
    // Ignore browsers that block audio without a gesture.
  }
}

export type OrderKitchenStatus = "none" | "unsent" | "cooking" | "ready";

export function orderKitchenStatus(order: {
  kitchen_ready_at: string | null;
  order_items: Array<{ kitchen_sent_at: string | null }>;
  open_ticket_count?: number;
}): OrderKitchenStatus {
  if (order.kitchen_ready_at) return "ready";

  const items = order.order_items ?? [];
  if (items.length === 0) return "none";

  const hasUnsent = items.some((line) => !line.kitchen_sent_at);
  const hasSent = items.some((line) => line.kitchen_sent_at);
  const openTickets = order.open_ticket_count ?? 0;

  if (openTickets > 0 || (hasSent && hasUnsent)) return "cooking";
  if (hasSent) return "cooking";
  if (hasUnsent) return "unsent";
  return "none";
}

export function orderKitchenStatusLabel(status: OrderKitchenStatus) {
  switch (status) {
    case "ready":
      return "Ready to serve";
    case "cooking":
      return "In kitchen";
    case "unsent":
      return "Not sent";
    default:
      return "";
  }
}
