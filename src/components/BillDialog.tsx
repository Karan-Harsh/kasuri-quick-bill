import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ban, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  cancelled_at: string | null;
  cancel_reason: string | null;
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

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** One settled bill: what was sold and the totals, with ways to print, cancel or erase it. */
export function BillDialog({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<"cancel" | "erase" | null>(null);
  const [reason, setReason] = useState("");

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
  const cancelled = bill?.status === "CANCELLED";

  const refresh = () => {
    for (const key of [
      "reports",
      "receipt",
      "today-stats",
      "inventory-items",
      "inventory-movements",
    ])
      queryClient.invalidateQueries({ queryKey: [key] });
  };
  const cancelBill = useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      api.post<{ bill_number: number }>(`/orders/${input.id}/cancel`, { reason: input.reason }),
    onSuccess: ({ bill_number }) => {
      refresh();
      setConfirm(null);
      setReason("");
      toast.success(`Bill #${bill_number} cancelled`, {
        description: "It no longer counts in sales. Stock it used was put back.",
      });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not cancel"),
  });
  const eraseBill = useMutation({
    mutationFn: (id: string) => api.post<{ bill_number: number }>(`/orders/${id}/erase`),
    onSuccess: ({ bill_number }) => {
      refresh();
      setConfirm(null);
      onClose();
      toast.success(`Bill #${bill_number} erased`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not erase"),
  });

  return (
    <Dialog open={orderId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {bill ? `Bill #${bill.bill_number}` : "Bill"}
            {cancelled && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                Cancelled
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {!bill ? (
          <p className="text-muted-foreground">
            {billQuery.isError ? "Could not load this bill." : "Loading…"}
          </p>
        ) : (
          <div className="space-y-4">
            {cancelled && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                Cancelled{bill.cancelled_at ? ` on ${when(bill.cancelled_at)}` : ""}
                {bill.cancel_reason ? ` — ${bill.cancel_reason}` : ""}. Not counted in sales.
              </p>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Date:</span>{" "}
                {when(bill.completed_at ?? bill.created_at)}
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

        <DialogFooter className="gap-2 sm:justify-between">
          {bill ? (
            <div className="flex flex-wrap gap-2">
              {!cancelled && (
                <Button variant="outline" className="h-11" onClick={() => setConfirm("cancel")}>
                  <Ban className="mr-2 size-4" /> Cancel bill
                </Button>
              )}
              <Button
                variant="ghost"
                className="h-11 text-destructive hover:text-destructive"
                onClick={() => setConfirm("erase")}
              >
                <Trash2 className="mr-2 size-4" /> Erase
              </Button>
            </div>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-2">
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
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          {confirm === "cancel" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel bill #{bill?.bill_number}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The bill stays in the list marked "Cancelled", but it no longer counts in sales or
                  profit. Stock its dishes used is put back.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor="cancelReason">Reason (optional)</Label>
                <Input
                  id="cancelReason"
                  value={reason}
                  maxLength={200}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. entered twice, customer left"
                  className="h-11"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">Keep bill</AlertDialogCancel>
                <Button
                  variant="destructive"
                  className="h-11"
                  disabled={cancelBill.isPending || !bill}
                  onClick={() => bill && cancelBill.mutate({ id: bill.id, reason })}
                >
                  Cancel bill
                </Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Erase bill #{bill?.bill_number} permanently?</AlertDialogTitle>
                <AlertDialogDescription>
                  The bill and everything on it are deleted for good and can't be brought back.
                  {cancelled
                    ? " "
                    : " It stops counting in sales, and stock its dishes used is put back. "}
                  Bill #{bill?.bill_number} will not be used again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">Keep bill</AlertDialogCancel>
                <Button
                  variant="destructive"
                  className="h-11"
                  disabled={eraseBill.isPending || !bill}
                  onClick={() => bill && eraseBill.mutate(bill.id)}
                >
                  Erase permanently
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
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
