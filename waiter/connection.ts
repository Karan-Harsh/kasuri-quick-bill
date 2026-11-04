// How the waiter phone talks to the counter: the pairing key, API calls and live updates.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const TOKEN_KEY = "kasuri-waiter-token";
const NAME_KEY = "kasuri-waiter-name";

// Opened from the counter's QR code, so the counter is the page's own address.
const SERVER = location.origin;

export const session = {
  token: () => localStorage.getItem(TOKEN_KEY),
  name: () => localStorage.getItem(NAME_KEY),
  save(token: string, name: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(NAME_KEY, name);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

/** The counter refused this phone's key (removed, or waiter phones turned off). */
export class NotPairedError extends Error {}
/** The counter couldn't be reached at all (Wi-Fi down, PC off). */
export class OfflineError extends Error {}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = session.token();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${SERVER}/api${path}`, init);
  } catch {
    throw new OfflineError("Can't reach the counter. Check the Wi-Fi.");
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && token) throw new NotPairedError(data?.error ?? "This phone is not paired");
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
};

const TOPIC_QUERIES: Record<string, string[]> = {
  orders: ["open-orders", "order", "order-items"],
  kitchen: ["open-orders"],
  menu: ["categories", "menu-items"],
  tables: ["tables"],
};

/** Live updates from the counter. Returns whether the phone is currently connected. */
export function useCounterConnection(onUnpaired: () => void) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const connect = () => {
      const token = session.token();
      if (!token) return;
      ws = new WebSocket(`${SERVER.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        setConnected(true);
        queryClient.invalidateQueries();
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; topics?: string[] };
          if (msg.type !== "changed") return;
          for (const topic of msg.topics ?? []) {
            for (const key of TOPIC_QUERIES[topic] ?? []) queryClient.invalidateQueries({ queryKey: [key] });
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = (event) => {
        setConnected(false);
        // 4001: this phone was removed on the counter.
        if (event.code === 4001) {
          onUnpaired();
          return;
        }
        if (!stopped) retry = setTimeout(connect, 2000);
      };
    };

    connect();
    // Phones sleep their Wi-Fi; reconnect as soon as the waiter looks at the screen again.
    const onVisible = () => {
      if (document.visibilityState === "visible" && ws?.readyState !== WebSocket.OPEN) {
        clearTimeout(retry);
        ws?.close();
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisible);
      ws?.close();
    };
  }, [queryClient, onUnpaired]);

  return connected;
}
