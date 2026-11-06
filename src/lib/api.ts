import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

// In development Vite proxies /api and /ws to the local server. In the desktop app the page is served
// by Tauri, so the server is called directly on this computer.
const SERVER = import.meta.env.DEV ? "" : "http://127.0.0.1:8787";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    res = await fetch(`${SERVER}/api${path}`, init);
  } catch {
    throw new Error("Can't reach the Kasuri server. Close and reopen the app.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

/** Which cached screens to reload when the server says a topic changed. */
const TOPIC_QUERIES: Record<string, QueryKey[]> = {
  orders: [["open-orders"], ["order"], ["order-items"], ["today-stats"], ["receipt"], ["reports"]],
  kitchen: [["kitchen-tickets"], ["kot"], ["open-orders"]],
  menu: [["categories"], ["menu-items"], ["menu-ingredients"]],
  inventory: [["inventory-items"], ["inventory-movements"]],
  settings: [["organization-settings"], ["app-settings"]],
  tables: [["tables"]],
  devices: [["devices"]],
  staff: [["staff"]],
};

/** A waiter sent an order to the kitchen from a phone. */
export interface WaiterKotEvent {
  type: "waiter-kot";
  ticket_id: string;
  kot_number: number;
  table_label: string | null;
  bill_number: number;
  waiter: string;
}

export interface AppSettings {
  waiter_phones_enabled: boolean;
  auto_print_waiter_kot: boolean;
}

/**
 * Keeps every screen in sync: the server pushes "changed" messages over a WebSocket whenever
 * anything is saved (from this window or, later, a waiter's phone). Reconnects automatically.
 * Returns whether the connection is currently up.
 */
export function useLiveUpdates(onWaiterKot?: (event: WaiterKotEvent) => void) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(true);
  // Latest callback without reconnecting the socket when it changes.
  const onWaiterKotRef = useRef(onWaiterKot);
  onWaiterKotRef.current = onWaiterKot;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const connect = () => {
      const url = SERVER
        ? `${SERVER.replace(/^http/, "ws")}/ws`
        : `${location.origin.replace(/^http/, "ws")}/ws`;
      ws = new WebSocket(url);
      ws.onopen = () => {
        setConnected(true);
        // Catch up on anything missed while disconnected.
        queryClient.invalidateQueries();
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; topics?: string[] };
          if (msg.type === "waiter-kot") {
            onWaiterKotRef.current?.(msg as unknown as WaiterKotEvent);
            return;
          }
          if (msg.type !== "changed") return;
          for (const topic of msg.topics ?? []) {
            for (const queryKey of TOPIC_QUERIES[topic] ?? [])
              queryClient.invalidateQueries({ queryKey });
          }
        } catch {
          // ignore malformed messages
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) retry = setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [queryClient]);

  return connected;
}
