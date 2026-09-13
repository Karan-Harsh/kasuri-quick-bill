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
