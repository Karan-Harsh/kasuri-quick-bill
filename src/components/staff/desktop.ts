// Confirmations and file saving for the staff screens.
import { toast } from "sonner";
import { api } from "@/lib/api";
import { openDialog } from "./DialogHost";

export function confirmAction(message: string, title = "Please confirm", confirmLabel = "Yes") {
  return openDialog({ kind: "confirm", title, message, confirmLabel });
}

export async function notify(message: string, title = "Kasuri") {
  await openDialog({ kind: "notify", title, message });
}

/** Saves a CSV export into the computer's Downloads folder (the desktop window can't download files). */
export async function saveTextFile(
  fileName: string,
  contents: string,
  _kind?: { name: string; ext: string },
): Promise<boolean> {
  try {
    const { path } = await api.post<{ path: string }>("/files/csv", { name: fileName, contents });
    toast.success("Saved to Downloads", { description: path });
    return true;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not save the file");
    return false;
  }
}
