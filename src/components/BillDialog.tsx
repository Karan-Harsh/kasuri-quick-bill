import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inr, orderTypeLabel, paymentLabel } from "@/lib/kasuri";

interface BillDetail {
  id: string;
  bill_number: number;
  order_type: string;
  discount: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  payment_method: string | null;
  created_at: string;
  completed_at: string | null;
  restaurant_tables: { label: string } | null;
  order_items: {
    id: string;
    item_name: string;
    unit_price: number;
    tax_rate: number;
    quantity: number;
    created_at: string;
  }[];
}

/** One settled bill: what was sold and the totals, with a way to print it again. */
export function BillDialog({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  // Same data (and cache) as the printed receipt page.
  const billQuery = useQuery({
    queryKey: ["receipt", orderId],
    queryFn: () => api.get<BillDetail>(`/orders/${orderId}/receipt`),
    enabled: orderId !== null,
  });
  const bill = billQuery.data?.id === orderId ? billQuery.data : undefined;
  const showGst = bill ? Number(bill.tax_amount) > 0 : false;
  const lines = bill
    ? [...bill.order_items].sort((a, b) => a.created_at.localeCompare(b.created_at))
    : [];

  return (
    <Dialog open={orderId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{bill ? `Bill #${bill.bill_number}` : "Bill"}</DialogTitle>
        </DialogHeader>

        {!bill ? (
          <p className="text-muted-foreground">
            {billQuery.isError ? "Could not load this bill." : "Loading…"}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Date:</span>{" "}
                {new Date(bill.completed_at ?? bill.created_at).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              <p className="text-right">
                <span className="text-muted-foreground">Payment:</span>{" "}
                {paymentLabel(bill.payment_method)}
              </p>
              <p>
                <span className="text-muted-foreground">Type:</span>{" "}
                {orderTypeLabel(bill.order_type)}
                {bill.restaurant_tables?.label ? ` · Table ${bill.restaurant_tables.label}` : ""}
              </p>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-left">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Rate</th>
                  <th className="py-2 text-right">Qty</th>
                  {showGst && <th className="py-2 text-right">GST</th>}
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b border-dashed border-border">
                    <td className="py-2">{line.item_name}</td>
                    <td className="py-2 text-right">{inr(Number(line.unit_price))}</td>
                    <td className="py-2 text-right">{line.quantity}</td>
                    {showGst && <td className="py-2 text-right">{Number(line.tax_rate)}%</td>}
                    <td className="py-2 text-right">
                      {inr(Number(line.unit_price) * line.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <Row label="Subtotal" value={inr(Number(bill.subtotal))} />
              {Number(bill.discount) > 0 && (
                <Row label="Discount" value={`- ${inr(Number(bill.discount))}`} />
              )}
              {showGst && <Row label="GST" value={inr(Number(bill.tax_amount))} />}
              <div className="flex justify-between border-t border-border pt-2 text-lg font-extrabold">
                <span>Total</span>
                <span>{inr(Number(bill.total))}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={onClose}>
            Close
          </Button>
          {bill && (
            <Button asChild className="h-11">
              <Link
                to="/receipt/$orderId"
                params={{ orderId: bill.id }}
                search={{ print: true, back: "reports" }}
              >
                <Printer className="mr-2 size-4" /> Print bill
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
