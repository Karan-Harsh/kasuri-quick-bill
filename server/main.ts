// Kasuri local server: owns the SQLite database and all billing rules.
// The desktop app talks to it at 127.0.0.1. When "Waiter phones" is on, it also listens on the
// restaurant Wi-Fi so paired phones can take orders.
//
//   bun server/main.ts --data-dir ./data [--port 8787] [--waiter-dir ./dist-waiter] [--dev]
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import type { Server, ServerWebSocket } from "bun";
import { createApp, type Client, type ServerEvent } from "./app";
import { openDatabase } from "./db";
import { Store } from "./store";

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "data-dir": { type: "string", default: "./data" },
    port: { type: "string", default: "8787" },
    "waiter-dir": { type: "string" },
    // Development only: also accept requests from the Vite dev server on any local port.
    dev: { type: "boolean", default: false },
  },
});

const port = Number(args.port);
const dataDir = path.resolve(args["data-dir"]!);
const backupDir = path.join(dataDir, "backups");
mkdirSync(backupDir, { recursive: true });
const dbPath = path.join(dataDir, "kasuri.db");
const db = openDatabase(dbPath);
const store = new Store(db);

// ---------- live updates ----------

type Socket = ServerWebSocket<{ client: Client }>;
const sockets = new Set<Socket>();

function broadcast(event: ServerEvent, to: "counter" | "all" = "all") {
  const msg = JSON.stringify(event);
  for (const ws of sockets) {
    if (to === "counter" && ws.data.client.kind !== "counter") continue;
    ws.send(msg);
  }
}

function disconnectDevice(deviceId: string) {
  for (const ws of sockets) {
    if (ws.data.client.kind === "waiter" && ws.data.client.device.id === deviceId) ws.close(4001, "Removed");
  }
}

// ---------- backups: one copy per day, last 30 kept ----------

const BACKUP_KEEP = 30;
let lastBackup: string | null = null;

function backupNow() {
  const day = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
  const file = path.join(backupDir, `kasuri-${day}.db`);
  rmSync(file, { force: true });
  db.query("VACUUM INTO $file").run({ file });
  lastBackup = new Date().toISOString();
  const old = readdirSync(backupDir)
    .filter((f) => /^kasuri-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .slice(0, -BACKUP_KEEP);
  for (const f of old) rmSync(path.join(backupDir, f), { force: true });
  return file;
}

function backupIfDue() {
  const today = new Date().toLocaleDateString("en-CA");
  if (readdirSync(backupDir).includes(`kasuri-${today}.db`)) return;
  try {
    backupNow();
  } catch (err) {
    console.error("Backup failed", err);
  }
}

// ---------- network ----------

/** This computer's addresses on the local network (what phones should connect to). */
function networkAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      // Skip link-local (169.254.x.x): no DHCP, phones can't reach it.
      if (addr.address.startsWith("169.254.")) continue;
      out.push(addr.address);
    }
  }
  // Typical home/office Wi-Fi ranges first.
  return out.sort((a, b) => Number(b.startsWith("192.168.")) - Number(a.startsWith("192.168.")));
}

const app = createApp({
  store,
  port,
  dev: args.dev === true,
  waiterDir: args["waiter-dir"] ? path.resolve(args["waiter-dir"]) : null,
  broadcast,
  disconnectDevice,
  networkAddresses,
  system: () => ({ dataDir, dbPath, backupDir, lastBackup }),
  backupNow,
  setWaiterPhonesEnabled: (enabled) => {
    // Let the current response finish, then switch listening address.
    setTimeout(() => listen(enabled), 50);
  },
});

let server: Server<{ client: Client }> | null = null;

/** Listens on this computer only, or on every network (the Wi-Fi) when waiter phones are on. */
function listen(waiterPhones: boolean) {
  const hostname = waiterPhones ? "0.0.0.0" : "127.0.0.1";
  if (server?.hostname === hostname) return;
  if (server) {
    for (const ws of sockets) if (ws.data.client.kind === "waiter") ws.close(4002, "Waiter phones turned off");
    server.stop(true);
  }
  server = Bun.serve<{ client: Client }>({
    hostname,
    port,
    fetch(req, srv) {
      const ip = srv.requestIP(req)?.address ?? null;
      if (new URL(req.url).pathname === "/ws") {
        const client = app.identifySocket(req, ip);
        if (!client) return new Response("Forbidden", { status: 403 });
        return srv.upgrade(req, { data: { client } }) ? undefined : new Response("Expected WebSocket", { status: 400 });
      }
      return app.handle(req, ip);
    },
    websocket: {
      open: (ws) => void sockets.add(ws),
      close: (ws) => void sockets.delete(ws),
      message: () => {},
    },
  });
  console.log(
    waiterPhones
      ? `Kasuri server on port ${port} — waiter phones can connect at ${networkAddresses().map((a) => `http://${a}:${port}`).join(", ") || "(no network found)"}`
      : `Kasuri server at http://127.0.0.1:${port} (this computer only)`,
  );
}

listen(store.appSettings().waiter_phones_enabled);
console.log(`Data: ${dataDir}`);

backupIfDue();
setInterval(backupIfDue, 60 * 60 * 1000);

const shutdown = () => {
  server?.stop(true);
  db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
