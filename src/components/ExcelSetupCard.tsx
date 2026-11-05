import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ImportResult {
  applied: boolean;
  problems: { sheet: string; row: number; message: string }[];
  inventory: { added: number; updated: number; unchanged: number };
  menu: { added: number; updated: number; unchanged: number; categoriesAdded: number };
  recipes: { dishes: number; lines: number };
}

/** The file's bytes as base64 (what the server's upload route expects). */
const readAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function summary(r: ImportResult) {
  const parts: string[] = [];
  const add = (label: string, added: number, updated: number) => {
    const bits = [added && `${added} new`, updated && `${updated} changed`].filter(Boolean);
    if (bits.length) parts.push(`${label}: ${bits.join(", ")}`);
  };
  add("Stock items", r.inventory.added, r.inventory.updated);
  add("Dishes", r.menu.added, r.menu.updated);
  if (r.menu.categoriesAdded)
    parts.push(`${plural(r.menu.categoriesAdded, "new category", "new categories")}`);
  if (r.recipes.dishes)
    parts.push(
      `Recipes for ${plural(r.recipes.dishes, "dish", "dishes")} (${plural(r.recipes.lines, "ingredient")})`,
    );
  return parts;
}

/** Download the menu, stock and recipes as one Excel file, fill it in, upload it back. */
export function ExcelSetupCard() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  const download = useMutation({
    mutationFn: () => api.post<{ path: string }>("/setup-sheet/download"),
    onSuccess: ({ path }) => {
      setSavedTo(path);
      toast.success("Excel sheet saved", { description: path });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  const upload = useMutation({
    mutationFn: (input: { data: string; apply: boolean }) =>
      api.post<ImportResult>("/setup-sheet/import", { file: input.data, apply: input.apply }),
    onSuccess: (result, input) => {
      if (input.apply && result.applied) {
        toast.success("Saved from Excel", { description: summary(result).join(" · ") });
        reset();
        return;
      }
      setCheck(result);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not read the file");
      reset();
    },
  });

  const reset = () => {
    setFile(null);
    setCheck(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const onPick = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      const data = await readAsBase64(picked);
      setFile({ name: picked.name, data });
      setCheck(null);
      upload.mutate({ data, apply: false });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read the file");
    }
  };

  const changes = check ? summary(check) : [];
  const nothingToDo = check && check.problems.length === 0 && changes.length === 0;

  return (
    <Card id="excel-setup" className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="mt-1 size-6 shrink-0 text-primary" />
        <div>
          <h2 className="text-xl font-bold">Excel setup</h2>
          <p className="text-sm text-muted-foreground">
            Add or change many stock items, dishes and recipes at once. Download the sheet, fill it
            in Excel, and upload it here. It already has everything currently in Kasuri.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          variant="outline"
          className="h-12 text-base"
          disabled={download.isPending}
          onClick={() => download.mutate()}
        >
          <Download className="mr-2 size-5" /> 1. Download sheet
        </Button>
        <Button
          className="h-12 text-base"
          disabled={upload.isPending}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="mr-2 size-5" /> 2. Upload filled sheet
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </div>

      {savedTo && (
        <p className="break-all text-sm text-muted-foreground">
          Saved to <span className="font-medium text-foreground">{savedTo}</span>. The first sheet
          explains each column.
        </p>
      )}

      {upload.isPending && <p className="text-sm text-muted-foreground">Checking {file?.name}…</p>}

      {check && file && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="font-semibold">{file.name}</p>

          {check.problems.length > 0 ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 font-semibold text-destructive">
                <AlertTriangle className="size-5" />
                {plural(check.problems.length, "problem")} found. Nothing was saved.
              </p>
              <p className="text-sm text-muted-foreground">
                Fix these rows in Excel, save, and upload again.
              </p>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {check.problems.map((p, i) => (
                  <li key={i}>
                    <span className="font-semibold">
                      {p.sheet}, row {p.row}:
                    </span>{" "}
                    {p.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : nothingToDo ? (
            <p className="text-sm text-muted-foreground">
              Everything in this file already matches Kasuri. Nothing to save.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="flex items-center gap-2 font-semibold text-primary">
                <CheckCircle2 className="size-5" /> Ready to save
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {changes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {check.problems.length === 0 && !nothingToDo && (
              <Button
                className="h-11"
                disabled={upload.isPending}
                onClick={() => upload.mutate({ data: file.data, apply: true })}
              >
                Save to Kasuri
              </Button>
            )}
            <Button variant="outline" className="h-11" onClick={reset}>
              {check.problems.length === 0 && !nothingToDo ? "Cancel" : "Close"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
