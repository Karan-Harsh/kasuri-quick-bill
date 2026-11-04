import { beforeEach, describe, expect, test } from "bun:test";
import { createApp, type ServerEvent } from "./app";
import { openDatabase } from "./db";
import { Store } from "./store";

const PHONE_IP = "192.168.1.25";
const PC = "http://192.168.1.10:8787";
const LOCAL = "http://127.0.0.1:8787";

let store: Store;
let app: ReturnType<typeof createApp>;
let events: { event: ServerEvent; to: string }[];
let lanToggles: boolean[];

beforeEach(() => {
  store = new Store(openDatabase(":memory:"));
  events = [];
  lanToggles = [];
  app = createApp({
    store,
    port: 8787,
    dev: false,
    waiterDir: null,
    broadcast: (event, to = "all") => void events.push({ event, to }),
    setWaiterPhonesEnabled: (on) => void lanToggles.push(on),
    disconnectDevice: () => {},
    networkAddresses: () => ["192.168.1.10"],
    system: () => ({}),
    backupNow: () => "",
  });
});

/** Sends a request as the counter (default) or from a phone's IP, optionally with a phone key. */
async function call(method: string, path: string, opts: { body?: unknown; ip?: string; token?: string; origin?: string; base?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  if (opts.origin) headers["Origin"] = opts.origin;
  const base = opts.base ?? (opts.ip ? PC : LOCAL);
  const req = new Request(base + path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await app.handle(req, opts.ip ?? "127.0.0.1");
  return { status: res.status, data: (await res.json().catch(() => null)) as any };
}

async function pairPhone(name = "Ramesh") {
  await call("PUT", "/api/app-settings", { body: { waiter_phones_enabled: true } });
  const { data } = await call("POST", "/api/devices/pairing");
  const res = await call("POST", "/api/devices/pair", { ip: PHONE_IP, origin: PC, body: { code: data.code, name } });
  expect(res.status).toBe(200);
  return res.data.token as string;
}

describe("counter", () => {
  test("has full access without a key", async () => {
    expect((await call("GET", "/api/reports?from=2000-01-01&to=2999-01-01")).status).toBe(200);
    expect((await call("GET", "/api/devices")).status).toBe(200);
  });

  test("turning waiter phones on switches the listening address", async () => {
    await call("PUT", "/api/app-settings", { body: { waiter_phones_enabled: true } });
    expect(lanToggles).toEqual([true]);
    await call("PUT", "/api/app-settings", { body: { auto_print_waiter_kot: false } });
    expect(lanToggles).toEqual([true]); // unchanged setting, no restart
  });

  test("pairing links point phones at this computer's Wi-Fi address", async () => {
    const { data } = await call("POST", "/api/devices/pairing");
    expect(data.code).toMatch(/^\d{6}$/);
    expect(data.links).toEqual([`http://192.168.1.10:8787/waiter/#pair=${data.code}`]);
  });
});

describe("strangers", () => {
  test("a device on the Wi-Fi without a key gets nothing", async () => {
    expect((await call("GET", "/api/tables", { ip: PHONE_IP })).status).toBe(401);
    expect((await call("GET", "/api/reports", { ip: PHONE_IP })).status).toBe(401);
  });

  test("other websites in the PC's browser are blocked", async () => {
    expect((await call("GET", "/api/tables", { origin: "https://evil.example" })).status).toBe(403);
  });

  test("requests addressed to a domain name are refused (DNS rebinding)", async () => {
    const res = await call("GET", "/api/tables", { base: "http://evil.example:8787", origin: "http://evil.example:8787" });
    expect(res.status).toBe(403);
  });

  test("pairing is refused while waiter phones are off", async () => {
    const res = await call("POST", "/api/devices/pair", { ip: PHONE_IP, body: { code: "123456", name: "X" } });
    expect(res.status).toBe(403);
  });

  test("wrong codes are rejected and the code dies after 5 tries", async () => {
    await call("PUT", "/api/app-settings", { body: { waiter_phones_enabled: true } });
    const { data } = await call("POST", "/api/devices/pairing");
    const wrong = data.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      expect((await call("POST", "/api/devices/pair", { ip: PHONE_IP, body: { code: wrong, name: "X" } })).status).toBe(401);
    }
    const res = await call("POST", "/api/devices/pair", { ip: PHONE_IP, body: { code: data.code, name: "X" } });
    expect(res.status).toBe(401);
    expect(res.data.error).toContain("expired");
  });
});

describe("waiter phones", () => {
  test("can take an order and send it to the kitchen; counter is told who sent it", async () => {
    const token = await pairPhone("Ramesh");
    const opts = { ip: PHONE_IP, token, origin: PC };
    const tables = (await call("GET", "/api/tables", opts)).data;
    const order = (await call("POST", "/api/orders", { ...opts, body: { table_id: tables[2].id } })).data;
    const menu = (await call("GET", "/api/menu-items", opts)).data;
    expect((await call("POST", `/api/orders/${order.id}/items`, { ...opts, body: { menu_item_id: menu[0].id } })).status).toBe(200);

    const kot = await call("POST", `/api/orders/${order.id}/send-to-kitchen`, opts);
    expect(kot.status).toBe(200);
    expect(store.order(order.id).created_by).toBe("Ramesh");
    expect(store.ticket(kot.data.id).sent_by).toBe("Ramesh");
    const notice = events.find((e) => e.event.type === "waiter-kot");
    expect(notice).toMatchObject({ to: "counter", event: { table_label: "T3", waiter: "Ramesh", kot_number: 1 } });
  });

  test("cannot settle, discount, see reports or change settings", async () => {
    const token = await pairPhone();
    const opts = { ip: PHONE_IP, token, origin: PC };
    const order = store.createOrder(null);
    expect((await call("POST", `/api/orders/${order.id}/settle`, { ...opts, body: {} })).status).toBe(403);
    expect((await call("DELETE", `/api/orders/${order.id}`, opts)).status).toBe(403);
    expect((await call("GET", "/api/reports", opts)).status).toBe(403);
    expect((await call("PUT", "/api/settings", { ...opts, body: { gst_enabled: true } })).status).toBe(403);
    expect((await call("GET", "/api/devices", opts)).status).toBe(403);
  });

  test("cannot start a parcel bill or change items already sent to the kitchen", async () => {
    const token = await pairPhone();
    const opts = { ip: PHONE_IP, token, origin: PC };
    expect((await call("POST", "/api/orders", { ...opts, body: { table_id: null } })).status).toBe(400);

    const t1 = (store.tables() as { id: string }[])[0]!.id;
    const order = store.createOrder(t1);
    store.addItem(order.id, (store.menuItems(true)[0] as { id: string }).id);
    store.sendToKitchen(order.id);
    const [line] = store.orderItems(order.id) as { id: string }[];
    const res = await call("PATCH", `/api/order-items/${line!.id}`, { ...opts, body: { quantity: 0 } });
    expect(res.status).toBe(403);
    expect(res.data.error).toContain("Ask the counter");
  });

  test("a removed phone, or phones turned off, are locked out", async () => {
    const token = await pairPhone();
    const opts = { ip: PHONE_IP, token, origin: PC };
    expect((await call("GET", "/api/me", opts)).data.device.name).toBe("Ramesh");

    await call("PUT", "/api/app-settings", { body: { waiter_phones_enabled: false } });
    expect((await call("GET", "/api/tables", opts)).status).toBe(403);
    await call("PUT", "/api/app-settings", { body: { waiter_phones_enabled: true } });

    const [device] = store.devices();
    await call("DELETE", `/api/devices/${device!.id}`);
    expect((await call("GET", "/api/tables", opts)).status).toBe(401);
  });
});
