// HTTP routes of the local server, and who may call them.
//
// Two kinds of clients:
//   counter — the desktop app on this computer (loopback address, no key). Full access.
//   waiter  — a paired phone on the Wi-Fi, sending its secret key. Can only take and send orders.
// Anyone else only gets the waiter app's files and the pairing endpoint.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { buildSetupWorkbook, importSetupWorkbook } from "./setup-sheet";
import { AppError, type AppSettings, type Device, type Store, type Topic } from "./store";
import { writeXlsx } from "./xlsx";

/** Largest setup sheet accepted for upload. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type Client = { kind: "counter" } | { kind: "waiter"; device: Device };

/** Messages pushed to connected screens over the WebSocket. */
export type ServerEvent =
  | { type: "changed"; topics: Topic[] }
  | {
      type: "waiter-kot";
      ticket_id: string;
      kot_number: number;
      table_label: string | null;
      bill_number: number;
      waiter: string;
    };

export interface AppOptions {
  store: Store;
  port: number;
  /** Development: also accept the Vite dev server (any localhost port) as the counter. */
  dev: boolean;
  /** Folder with the built waiter app, served at /waiter. */
  waiterDir: string | null;
  broadcast: (event: ServerEvent, to?: "counter" | "all") => void;
  /** Turns listening on the Wi-Fi on or off. */
  setWaiterPhonesEnabled: (enabled: boolean) => void;
  /** Closes live connections of a removed phone. */
  disconnectDevice: (deviceId: string) => void;
  networkAddresses: () => string[];
  system: () => unknown;
  backupNow: () => string;
  /** Saves a file for the user (the Downloads folder) and returns where it went. */
  saveDownload?: (fileName: string, bytes: Uint8Array) => string;
}

// Request bodies are untrusted JSON; every handler checks the fields it reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { params: Record<string, string>; query: URLSearchParams; body: any; client: Client };
type Handler = (ctx: Ctx) => unknown;
type Access = "counter" | "waiter" | "public";

const COUNTER_ORIGINS = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
]);

export function isLoopback(ip: string | null | undefined) {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

/** "localhost" or a literal IPv4/IPv6 address — never a domain name. */
export function isAllowedHost(hostname: string) {
  return (
    hostname === "localhost" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    /^\[[0-9a-f:.]+\]$/i.test(hostname)
  );
}

export function createApp(opts: AppOptions) {
  const { store } = opts;
  const routes: {
    method: string;
    pattern: RegExp;
    keys: string[];
    access: Access;
    handler: Handler;
  }[] = [];

  const route = (method: string, pathPattern: string, access: Access, handler: Handler) => {
    const keys: string[] = [];
    const pattern = new RegExp(
      "^" + pathPattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$",
    );
    routes.push({ method, pattern, keys, access, handler });
  };

  /** Runs a change and tells every connected screen what to reload. */
  const change =
    (topics: Topic[], fn: Handler): Handler =>
    (ctx) => {
      const result = fn(ctx);
      opts.broadcast({ type: "changed", topics });
      return result ?? { ok: true };
    };

  const who = (client: Client) => (client.kind === "waiter" ? client.device.name : null);

  // ----- public -----
  route("GET", "/api/health", "public", () => ({ ok: true, app: "kasuri" }));
  route("POST", "/api/devices/pair", "public", ({ body }) => {
    if (!store.appSettings().waiter_phones_enabled)
      throw new AppError("Waiter phones are turned off on the counter.", 403);
    const result = store.pairDevice(body?.code, body?.name);
    opts.broadcast({ type: "changed", topics: ["devices"] }, "counter");
    return result;
  });

  // ----- waiter phones (and the counter) -----
  route("GET", "/api/me", "waiter", ({ client }) =>
    client.kind === "waiter" ? { device: client.device } : { device: null },
  );
  route("GET", "/api/settings", "waiter", () => store.settings());
  route("GET", "/api/tables", "waiter", () => store.tables());
  route("GET", "/api/orders/open", "waiter", () => store.openOrders());
  route("GET", "/api/categories", "waiter", () => store.categories());
  route("GET", "/api/menu-items", "waiter", ({ query, client }) =>
    store.menuItems(client.kind === "waiter" || query.get("active") === "1"),
  );
  route("POST", "/api/orders", "waiter", ({ body, client }) => {
    // Waiters serve tables; parcel bills are made at the counter.
    if (client.kind === "waiter" && !body?.table_id) throw new AppError("Pick a table");
    const result = store.createOrder(body?.table_id ?? null, who(client));
    opts.broadcast({ type: "changed", topics: ["orders"] });
    return result;
  });
  route("GET", "/api/orders/:id", "waiter", ({ params }) => store.order(params.id!));
  route("GET", "/api/orders/:id/items", "waiter", ({ params }) => store.orderItems(params.id!));
  route(
    "POST",
    "/api/orders/:id/items",
    "waiter",
    change(["orders"], ({ params, body }) => store.addItem(params.id!, body?.menu_item_id)),
  );
  route(
    "PATCH",
    "/api/order-items/:id",
    "waiter",
    change(["orders"], ({ params, body, client }) =>
      store.setItemQuantity(params.id!, Number(body?.quantity), {
        waiter: client.kind === "waiter",
      }),
    ),
  );
  route("POST", "/api/orders/:id/send-to-kitchen", "waiter", ({ params, client }) => {
    const ticket = store.sendToKitchen(params.id!, who(client));
    opts.broadcast({ type: "changed", topics: ["orders", "kitchen"] });
    if (client.kind === "waiter") {
      const order = store.order(params.id!);
      opts.broadcast(
        {
          type: "waiter-kot",
          ticket_id: ticket.id,
          kot_number: ticket.kot_number,
          table_label: order.restaurant_tables?.label ?? null,
          bill_number: order.bill_number,
          waiter: client.device.name,
        },
        "counter",
      );
    }
    return ticket;
  });
  route(
    "POST",
    "/api/orders/:id/acknowledge-ready",
    "waiter",
    change(["orders"], ({ params }) => store.acknowledgeReady(params.id!)),
  );

  // ----- counter only -----
  route("GET", "/api/system", "counter", () => opts.system());
  route("POST", "/api/system/backup", "counter", () => ({ file: opts.backupNow() }));
  route("GET", "/api/system/network", "counter", () => ({
    port: opts.port,
    addresses: opts.networkAddresses(),
    waiter_app_available: Boolean(opts.waiterDir),
  }));

  route(
    "PUT",
    "/api/settings",
    "counter",
    change(["settings", "orders"], ({ body }) => store.updateSettings(body)),
  );
  route("GET", "/api/app-settings", "counter", () => store.appSettings());
  route("PUT", "/api/app-settings", "counter", ({ body }) => {
    const before = store.appSettings();
    const after = store.updateAppSettings(body as Partial<AppSettings>);
    if (before.waiter_phones_enabled !== after.waiter_phones_enabled)
      opts.setWaiterPhonesEnabled(after.waiter_phones_enabled);
    opts.broadcast({ type: "changed", topics: ["settings"] }, "counter");
    return after;
  });

  route("GET", "/api/devices", "counter", () => store.devices());
  route("POST", "/api/devices/pairing", "counter", () => {
    const { code, expires_at } = store.startPairing();
    const links = opts
      .networkAddresses()
      .map((ip) => `http://${ip}:${opts.port}/waiter/#pair=${code}`);
    return { code, expires_at, links };
  });
  route("DELETE", "/api/devices/:id", "counter", ({ params }) => {
    store.removeDevice(params.id!);
    opts.disconnectDevice(params.id!);
    opts.broadcast({ type: "changed", topics: ["devices"] }, "counter");
    return { ok: true };
  });

  route("GET", "/api/orders/:id/receipt", "counter", ({ params }) => store.receipt(params.id!));
  route(
    "POST",
    "/api/orders/:id/settle",
    "counter",
    // Settling uses up the dishes' ingredients, so stock changes too.
    change(["orders", "kitchen", "inventory"], ({ params, body }) =>
      store.settle(params.id!, body ?? {}),
    ),
  );
  route(
    "DELETE",
    "/api/orders/:id",
    "counter",
    change(["orders", "kitchen"], ({ params }) => store.discardOrder(params.id!)),
  );
  route(
    "POST",
    "/api/orders/:id/cancel",
    "counter",
    change(["orders", "inventory"], ({ params, body }) =>
      store.cancelBill(params.id!, typeof body?.reason === "string" ? body.reason : null),
    ),
  );
  route(
    "POST",
    "/api/orders/:id/erase",
    "counter",
    change(["orders", "inventory"], ({ params }) => store.eraseBill(params.id!)),
  );
  route("GET", "/api/stats/today", "counter", ({ query }) =>
    store.todayStats(query.get("from") ?? new Date(0).toISOString()),
  );

  route("GET", "/api/kitchen/tickets", "counter", () => store.openTickets());
  route("GET", "/api/kitchen/tickets/:id", "counter", ({ params }) => store.ticket(params.id!));
  route(
    "POST",
    "/api/kitchen/tickets/:id/complete",
    "counter",
    change(["kitchen", "orders"], ({ params }) => store.completeTicket(params.id!)),
  );

  route(
    "POST",
    "/api/categories",
    "counter",
    change(["menu"], ({ body }) => store.addCategory(body?.name)),
  );
  route(
    "POST",
    "/api/menu-items",
    "counter",
    change(["menu", "inventory"], ({ body }) => store.saveMenuItem(null, body ?? {})),
  );
  route(
    "PATCH",
    "/api/menu-items/:id",
    "counter",
    change(["menu", "inventory"], ({ params, body }) => store.saveMenuItem(params.id!, body ?? {})),
  );
  route(
    "DELETE",
    "/api/menu-items/:id",
    "counter",
    change(["menu", "inventory"], ({ params }) => store.deleteMenuItem(params.id!)),
  );
  route("GET", "/api/menu-ingredients", "counter", () => store.menuIngredients());
  route(
    "POST",
    "/api/seed-starter",
    "counter",
    change(["menu", "tables"], () => store.seedStarter()),
  );

  route("GET", "/api/reports", "counter", ({ query }) =>
    store.report(query.get("from") ?? "", query.get("to") ?? ""),
  );

  // ----- staff, attendance and salary (counter only: phones must never see salaries) -----
  const staff = store.staff;
  const id = (params: Record<string, string>) => Number(params.id);
  route("GET", "/api/staff/settings", "counter", () => staff.settings());
  route(
    "PUT",
    "/api/staff/settings",
    "counter",
    change(["staff"], ({ body }) => staff.saveSettings(body ?? {})),
  );
  route("GET", "/api/staff/employees", "counter", () => staff.employees());
  route("GET", "/api/staff/employees/:id", "counter", ({ params }) => staff.employee(id(params)));
  route(
    "POST",
    "/api/staff/employees",
    "counter",
    change(["staff"], ({ body }) => staff.createEmployee(body ?? {})),
  );
  route(
    "PUT",
    "/api/staff/employees/:id",
    "counter",
    change(["staff"], ({ params, body }) => staff.updateEmployee(id(params), body ?? {})),
  );
  route(
    "DELETE",
    "/api/staff/employees/:id",
    "counter",
    change(["staff"], ({ params }) => staff.deleteEmployee(id(params))),
  );
  route("GET", "/api/staff/attendance", "counter", ({ query }) =>
    query.get("date")
      ? staff.attendanceForDate(query.get("date")!)
      : staff.attendanceForMonth(query.get("month") ?? ""),
  );
  route(
    "PUT",
    "/api/staff/attendance",
    "counter",
    change(["staff"], ({ body }) => staff.saveAttendance(body?.records)),
  );
  route("GET", "/api/staff/adjustments", "counter", ({ query }) =>
    query.get("employee")
      ? staff.adjustmentsForEmployee(Number(query.get("employee")))
      : staff.adjustmentsForMonth(query.get("month") ?? ""),
  );
  route(
    "POST",
    "/api/staff/adjustments",
    "counter",
    change(["staff"], ({ body }) => staff.addAdjustment(body ?? {})),
  );
  route(
    "DELETE",
    "/api/staff/adjustments/:id",
    "counter",
    change(["staff"], ({ params }) => staff.deleteAdjustment(id(params))),
  );
  route("GET", "/api/staff/payroll", "counter", ({ query }) =>
    staff.payroll(query.get("month") ?? ""),
  );
  route(
    "POST",
    "/api/staff/payments",
    "counter",
    change(["staff"], ({ body }) => staff.pay(body ?? {})),
  );
  route(
    "DELETE",
    "/api/staff/payments/:id",
    "counter",
    change(["staff"], ({ params }) => staff.undoPayment(id(params))),
  );
  route("GET", "/api/staff/employees/:id/payments", "counter", ({ params }) =>
    staff.paymentsForEmployee(id(params)),
  );

  /** Saves a CSV export into the Downloads folder. body: { name: "x.csv", contents: "..." } */
  route("POST", "/api/files/csv", "counter", ({ body }) => {
    if (!opts.saveDownload) throw new AppError("Saving files isn't available here", 500);
    const name = String(body?.name ?? "")
      .replace(/[\\/:*?"<>|]/g, "")
      .trim();
    if (!/^[\w .()-]{1,80}\.csv$/i.test(name)) throw new AppError("Invalid file name");
    if (typeof body?.contents !== "string") throw new AppError("Nothing to save");
    if (body.contents.length > 5 * 1024 * 1024) throw new AppError("This export is too big");
    // UTF-8 marker first, so Excel shows ₹ and names correctly.
    return { path: opts.saveDownload(name, new TextEncoder().encode("\ufeff" + body.contents)) };
  });

  // ----- Excel setup sheet -----
  route("POST", "/api/setup-sheet/download", "counter", () => {
    if (!opts.saveDownload) throw new AppError("Saving files isn't available here", 500);
    const day = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
    const bytes = writeXlsx(buildSetupWorkbook(store));
    return { path: opts.saveDownload(`Kasuri setup ${day}.xlsx`, bytes) };
  });
  /** body: { file: base64 of the .xlsx, apply: false to only check it } */
  route("POST", "/api/setup-sheet/import", "counter", ({ body }) => {
    if (typeof body?.file !== "string" || body.file === "") throw new AppError("Choose a file");
    const bytes = new Uint8Array(Buffer.from(body.file, "base64"));
    if (bytes.byteLength > MAX_UPLOAD_BYTES)
      throw new AppError("This file is too big. The setup sheet should be well under 5 MB.");
    const result = importSetupWorkbook(store, bytes, body.apply === true);
    if (result.applied) opts.broadcast({ type: "changed", topics: ["menu", "inventory"] });
    return result;
  });

  route("GET", "/api/inventory/items", "counter", () => store.inventoryItems());
  route(
    "POST",
    "/api/inventory/items",
    "counter",
    change(["inventory"], ({ body }) => store.saveInventoryItem(null, body ?? {})),
  );
  route(
    "PUT",
    "/api/inventory/items/:id",
    "counter",
    change(["inventory", "menu"], ({ params, body }) =>
      store.saveInventoryItem(params.id!, body ?? {}),
    ),
  );
  route(
    "PATCH",
    "/api/inventory/items/:id/active",
    "counter",
    change(["inventory"], ({ params, body }) =>
      store.setInventoryActive(params.id!, Boolean(body?.is_active)),
    ),
  );
  route(
    "POST",
    "/api/inventory/items/:id/movements",
    "counter",
    change(["inventory"], ({ params, body }) =>
      store.recordMovement(params.id!, body?.type, Number(body?.quantity), body?.note),
    ),
  );
  route("GET", "/api/inventory/movements", "counter", ({ query }) =>
    store.inventoryMovements(Number(query.get("limit") ?? 30)),
  );

  // ----- who is calling -----

  const isCounterOrigin = (origin: string) =>
    COUNTER_ORIGINS.has(origin) ||
    (opts.dev && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));

  /** Origins allowed to call the API at all: the counter app, or a page served by this server itself. */
  const originAllowed = (origin: string | null, url: URL) =>
    !origin || isCounterOrigin(origin) || origin === url.origin;

  const bearer = (req: Request, url: URL) =>
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    null;

  /** counter, waiter, null (unknown), or throws if a phone key is invalid. */
  function identify(req: Request, url: URL, ip: string | null): Client | null {
    const token = bearer(req, url);
    if (token) {
      if (!store.appSettings().waiter_phones_enabled)
        throw new AppError("Waiter phones are turned off on the counter.", 403);
      const device = store.deviceForToken(token);
      if (!device)
        throw new AppError("This phone is not paired. Scan the QR code on the counter again.", 401);
      return { kind: "waiter", device };
    }
    if (isLoopback(ip)) {
      const origin = req.headers.get("origin");
      if (!origin || isCounterOrigin(origin) || origin === url.origin) return { kind: "counter" };
    }
    return null;
  }

  function corsHeaders(req: Request, url: URL): Record<string, string> {
    const origin = req.headers.get("origin");
    if (!origin || !originAllowed(origin, url)) return {};
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      Vary: "Origin",
    };
  }

  const json = (req: Request, url: URL, data: unknown, status = 200) =>
    new Response(JSON.stringify(data ?? null), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...corsHeaders(req, url),
      },
    });

  /** Serves the built waiter app (a single-page app) from opts.waiterDir. */
  function serveWaiterFile(url: URL): Response {
    if (!opts.waiterDir)
      return new Response("The waiter app is not installed on this computer.", { status: 404 });
    const rel = decodeURIComponent(url.pathname.replace(/^\/waiter\/?/, ""));
    const root = path.resolve(opts.waiterDir);
    let file = path.resolve(root, rel || "index.html");
    if (!file.startsWith(root + path.sep) && file !== root)
      return new Response("Not found", { status: 404 });
    if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(root, "index.html");
    const isAsset = file.includes(`${path.sep}assets${path.sep}`);
    return new Response(Bun.file(file), {
      headers: { "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-cache" },
    });
  }

  async function handle(req: Request, ip: string | null): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("origin");

    // Phones reach us by IP address and the counter by 127.0.0.1/localhost. Refusing domain names
    // stops a website from pointing its own domain at this computer to get in (DNS rebinding).
    if (!isAllowedHost(url.hostname)) return new Response("Forbidden", { status: 403 });

    if (url.pathname === "/" && !isLoopback(ip))
      return Response.redirect(`${url.origin}/waiter/`, 302);
    if (url.pathname === "/waiter" || url.pathname.startsWith("/waiter/"))
      return serveWaiterFile(url);
    if (!url.pathname.startsWith("/api/")) return json(req, url, { error: "Not found" }, 404);

    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: corsHeaders(req, url) });
    if (!originAllowed(origin, url)) return json(req, url, { error: "Forbidden" }, 403);

    try {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.pattern);
        if (!m) continue;

        const client =
          r.access === "public" ? identifyQuietly(req, url, ip) : identify(req, url, ip);
        if (r.access !== "public") {
          if (!client) throw new AppError("Not allowed", 401);
          if (r.access === "counter" && client.kind !== "counter")
            throw new AppError("Only the counter can do this", 403);
        }

        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
        const body =
          req.method === "GET" || req.method === "DELETE"
            ? null
            : await req.json().catch(() => null);
        return json(
          req,
          url,
          r.handler({
            params,
            query: url.searchParams,
            body,
            client: client ?? { kind: "counter" },
          }),
        );
      }
      return json(req, url, { error: "Not found" }, 404);
    } catch (err) {
      if (err instanceof AppError) return json(req, url, { error: err.message }, err.status);
      const message = err instanceof Error ? err.message : String(err);
      if (/UNIQUE constraint failed/.test(message))
        return json(req, url, { error: "That already exists" }, 409);
      console.error(err);
      return json(req, url, { error: "Something went wrong on the counter computer" }, 500);
    }
  }

  function identifyQuietly(req: Request, url: URL, ip: string | null): Client | null {
    try {
      return identify(req, url, ip);
    } catch {
      return null;
    }
  }

  /** For WebSocket upgrades: who is connecting, or null to refuse. */
  function identifySocket(req: Request, ip: string | null): Client | null {
    const url = new URL(req.url);
    if (!isAllowedHost(url.hostname) || !originAllowed(req.headers.get("origin"), url)) return null;
    return identifyQuietly(req, url, ip);
  }

  return { handle, identifySocket };
}
