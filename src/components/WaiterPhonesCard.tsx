import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Smartphone, Trash2, Wifi, WifiOff } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { api, type AppSettings } from "@/lib/api";

interface Device {
  id: string;
  name: string;
  created_at: string;
  last_seen_at: string | null;
}

interface Pairing {
  code: string;
  expires_at: string;
  links: string[];
}

function lastSeen(iso: string | null) {
  if (!iso) return "never";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/** Settings section: let waiters' phones connect over Wi-Fi, pair new phones, remove old ones. */
export function WaiterPhonesCard() {
  const queryClient = useQueryClient();
  const [pairing, setPairing] = useState<Pairing | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => api.get<AppSettings>("/app-settings"),
  });
  const devicesQuery = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.get<Device[]>("/devices"),
  });
  const networkQuery = useQuery({
    queryKey: ["network"],
    queryFn: () =>
      api.get<{ port: number; addresses: string[]; waiter_app_available: boolean }>(
        "/system/network",
      ),
    refetchInterval: 30_000,
  });

  const updateSettings = useMutation({
    mutationFn: (patch: Partial<AppSettings>) => api.put<AppSettings>("/app-settings", patch),
    onSuccess: (next) => {
      queryClient.setQueryData(["app-settings"], next);
      queryClient.invalidateQueries({ queryKey: ["network"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  const startPairing = useMutation({
    mutationFn: () => api.post<Pairing>("/devices/pairing"),
    onSuccess: setPairing,
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not start pairing"),
  });

  const removeDevice = useMutation({
    mutationFn: (id: string) => api.del(`/devices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Phone removed. It can no longer take orders.");
    },
  });

  // Close the QR dialog as soon as a new phone shows up in the list.
  const devices = useMemo(() => devicesQuery.data ?? [], [devicesQuery.data]);
  const deviceCountRef = useRef(devices.length);
  useEffect(() => {
    if (pairing && devices.length > deviceCountRef.current) {
      const newest = devices[devices.length - 1];
      toast.success(`${newest?.name ?? "Phone"} is connected`);
      setPairing(null);
    }
    deviceCountRef.current = devices.length;
  }, [devices, pairing]);

  const enabled = settingsQuery.data?.waiter_phones_enabled ?? false;
  const autoPrint = settingsQuery.data?.auto_print_waiter_kot ?? true;
  const addresses = networkQuery.data?.addresses ?? [];

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-xl font-bold">Waiter phones</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Waiters can take orders on their phones over the restaurant Wi-Fi — no internet needed.
          Orders arrive here and in the kitchen instantly. Phones can only take and send orders;
          bills are settled at this counter.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
        <div>
          <p className="font-semibold">Let waiter phones connect</p>
          <p className="text-sm text-muted-foreground">
            {enabled
              ? "On. The first time, Windows may ask to allow Kasuri on the network — click Allow."
              : "Off. Only this computer can use Kasuri."}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={updateSettings.isPending}
          onCheckedChange={(checked) => updateSettings.mutate({ waiter_phones_enabled: checked })}
        />
      </div>

      {enabled && (
        <>
          {addresses.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <WifiOff className="mt-0.5 size-5 shrink-0" />
              This computer is not connected to a Wi-Fi or cable network, so phones can't reach it.
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-border p-4 text-sm">
              <Wifi className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              <div>
                Phones connect to{" "}
                <span className="font-semibold">
                  {addresses.map((a) => `${a}:${networkQuery.data?.port}`).join(" or ")}
                </span>
                . Phones must be on the same Wi-Fi as this computer (not a guest network).
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Paired phones</h3>
              <Button
                className="h-11"
                disabled={startPairing.isPending || addresses.length === 0}
                onClick={() => startPairing.mutate()}
              >
                <Smartphone className="mr-2 size-4" /> Add a phone
              </Button>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold">{d.name}</p>
                    <p className="text-muted-foreground">Last used {lastSeen(d.last_seen_at)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removeDevice.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${d.name}? That phone will no longer be able to take orders.`,
                        )
                      ) {
                        removeDevice.mutate(d.id);
                      }
                    }}
                  >
                    <Trash2 className="mr-1 size-4" /> Remove
                  </Button>
                </li>
              ))}
              {devices.length === 0 && (
                <li className="px-4 py-3 text-sm text-muted-foreground">
                  No phones yet. Click "Add a phone" and scan the code with the waiter's phone.
                </li>
              )}
            </ul>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <p className="font-semibold">Print KOT here for phone orders</p>
              <p className="text-sm text-muted-foreground">
                When a waiter sends an order, print its kitchen ticket on this computer's printer.
              </p>
            </div>
            <Switch
              checked={autoPrint}
              disabled={updateSettings.isPending}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ auto_print_waiter_kot: checked })
              }
            />
          </div>
        </>
      )}

      <PairingDialog pairing={pairing} onClose={() => setPairing(null)} />
    </Card>
  );
}

function PairingDialog({ pairing, onClose }: { pairing: Pairing | null; onClose: () => void }) {
  const [linkIndex, setLinkIndex] = useState(0);
  const [qrSvg, setQrSvg] = useState("");
  const link = pairing?.links[linkIndex] ?? pairing?.links[0] ?? "";

  useEffect(() => {
    setLinkIndex(0);
  }, [pairing?.code]);

  useEffect(() => {
    if (!link) return;
    QRCode.toString(link, { type: "svg", margin: 1, width: 260 }).then(setQrSvg, () =>
      setQrSvg(""),
    );
  }, [link]);

  const pairPageUrl = link.replace(/#.*$/, "");

  return (
    <Dialog open={Boolean(pairing)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a waiter's phone</DialogTitle>
          <DialogDescription>
            On the phone, connect to the restaurant Wi-Fi, open the camera and point it at this
            code.
          </DialogDescription>
        </DialogHeader>
        {pairing && (
          <div className="space-y-4 text-center">
            <div
              className="mx-auto w-fit rounded-lg border border-border bg-white p-2"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div>
              <p className="text-sm text-muted-foreground">
                No camera? Open this in the phone's browser:
              </p>
              <p className="font-semibold break-all">{pairPageUrl}</p>
              <p className="mt-2 text-sm text-muted-foreground">and enter the code</p>
              <p className="text-4xl font-extrabold tracking-[0.3em]">{pairing.code}</p>
            </div>
            {pairing.links.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLinkIndex((i) => (i + 1) % pairing.links.length)}
              >
                Phone can't connect? Try the other network address
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              The code works once and expires in 10 minutes. This window closes when the phone is
              connected.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
