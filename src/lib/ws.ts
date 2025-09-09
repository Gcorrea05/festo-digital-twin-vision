// src/lib/ws.ts
export type LiveMessage = { type: "snapshot"; data: any } | any;

type Handlers = {
  onOpen?: (e: Event) => void;
  onMessage?: (m: LiveMessage) => void;
  onError?: (e: Event) => void;
  onClose?: (e: CloseEvent) => void;
  onReconnect?: (attempt: number, delayMs: number) => void;
};

export type WSClient = { close: () => void; isConnected: () => boolean };

function buildWsUrl(): string {
  // Em DEV, conecta DIRETO no backend (evita proxy WS do Vite no Windows)
  if (import.meta.env.DEV) {
    const base = (import.meta as any).env?.VITE_API_BASE as string | undefined;
    const httpBase =
      base && /^https?:\/\//i.test(base) ? base.replace(/\/+$/, "") : "http://127.0.0.1:8000";
    const u = new URL(httpBase);
    const proto = u.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${u.host}${u.pathname.replace(/\/+$/, "")}/api/ws/snapshot`;
  }
  // Em prod, mesma origem
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/ws/snapshot`;
}

let singleton: { ws?: WebSocket; connected?: boolean } = {};

export function openLiveWS(h: Handlers = {}): WSClient {
  const url = buildWsUrl();
  if (import.meta.env.DEV) console.info("[WS] target:", url);

  // se já houver uma conexão ativa, reaproveita
  if (singleton.connected && singleton.ws) {
    return { close: () => singleton.ws?.close(), isConnected: () => true };
  }

  let ws: WebSocket | null = null;
  let connected = false;
  let attempt = 0;
  let closedByUser = false;
  let recon: number | undefined;

  const scheduleReconnect = () => {
    if (closedByUser) return;
    attempt += 1;
    const base = Math.min(10000, 500 * Math.pow(2, attempt));
    const jitter = Math.random() * 300;
    const delay = base + jitter;
    h.onReconnect?.(attempt, delay);
    recon = window.setTimeout(connect, delay) as unknown as number;
  };

  const clearTimers = () => {
    if (recon) window.clearTimeout(recon);
    recon = undefined;
  };

  const connect = () => {
    clearTimers();
    try {
      ws = new WebSocket(url);
      singleton.ws = ws;
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[WS] constructor error", e);
      scheduleReconnect();
      return;
    }

    ws.onopen = (ev) => {
      connected = true;
      singleton.connected = true;
      attempt = 0;
      h.onOpen?.(ev);
      // ⚠️ NÃO envie nada para o servidor (sem subscribe/ping)
    };

    ws.onmessage = (ev) => {
      try {
        const raw: LiveMessage = JSON.parse(ev.data);
        if (raw?.type === "snapshot") h.onMessage?.(raw);
      } catch {
        // ignora não-JSON
      }
    };

    ws.onerror = (ev) => h.onError?.(ev);

    ws.onclose = (ev) => {
      connected = false;
      singleton.connected = false;
      singleton.ws = undefined;
      h.onClose?.(ev);
      if (import.meta.env.DEV) console.warn("[WS] closed", ev.code, ev.reason || "(no reason)");
      clearTimers();
      scheduleReconnect();
    };
  };

  connect();

  return {
    close: () => {
      closedByUser = true;
      try { ws?.close(); } catch {}
      clearTimers();
    },
    isConnected: () => connected,
  };
}
