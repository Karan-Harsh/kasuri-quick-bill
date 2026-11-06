import { AlertTriangle, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Modal } from "./ui";

interface DialogRequest {
  kind: "confirm" | "notify";
  title: string;
  message: string;
  confirmLabel?: string;
  resolve: (ok: boolean) => void;
}

let show: ((req: DialogRequest) => void) | null = null;

/**
 * In-app replacement for window.confirm / window.alert. Native popups are blocked or
 * look out of place in some webviews, so every confirmation goes through this instead.
 */
export function openDialog(req: Omit<DialogRequest, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(window.confirm(req.message));
    show({ ...req, resolve });
  });
}

/** Mount once near the root of the app. */
export default function DialogHost() {
  const [req, setReq] = useState<DialogRequest | null>(null);

  useEffect(() => {
    show = setReq;
    return () => {
      show = null;
    };
  }, []);

  if (!req) return null;

  const close = (ok: boolean) => {
    req.resolve(ok);
    setReq(null);
  };

  return (
    <Modal title={req.title} onClose={() => close(false)}>
      <div className="flex gap-3">
        {req.kind === "confirm" ? (
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={22} />
        ) : (
          <Info className="mt-0.5 shrink-0 text-sky-600" size={22} />
        )}
        <p className="whitespace-pre-line text-foreground">{req.message}</p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        {req.kind === "confirm" ? (
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button autoFocus onClick={() => close(true)}>
              {req.confirmLabel ?? "Yes"}
            </Button>
          </>
        ) : (
          <Button autoFocus onClick={() => close(true)}>
            OK
          </Button>
        )}
      </div>
    </Modal>
  );
}
