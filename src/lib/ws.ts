// src/lib/ws.ts  — FINAL (alinhado ao backend)
// WS RAIZ: /ws/opc, /ws/mpu
// WS com prefixo (snapshot): /api/ws/snapshot

import { getApiBase } from "./api";

export type LiveMessage = { type: "snapshot"; data: any } | any;

type WSHandlers = {
  onOpen?: (e: Event) => void;
  onMessage?: (m: any) => void;
  onError?: (e: Event) => void;
  onClose?: (e: CloseEvent) => void;
  onReconnect?: (attempt: number, delayMs: number) => void;
};
export type WSClient = { close: () => void; isConnected: () => boolean };

// --- helpers ---
function wsUrlRoot(path: string): string {
  const base = getApiBase();              // http://127.0.0.1:8000
  const u = new URL(base);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  const right = path.startsWith("/") ? path : `/${path}`;
  return `${proto}//${u.host}${right}`;   // ws://127.0.0.1:8000/...
}
function wsUrlApi(path: string): string {
  // apenas para o snapshot que o backend expõe em /api/ws/snapshot
  const base = getApiBase();
  const u = new URL(base);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  const right = path.startsWith("/") ? path : `/${path}`;
  return `${proto}//${u.host}/api${right}`;
}

function openWS(absUrl: string, h: WSHandlers = {}): WSClient {
  let ws: WebSocket | null = null;
  let connected = false;
  let attempt = 0;
  let closedByUser = false;
  let timer: number | undefined;

  if (import.meta.env.DEV) console.info("[WS] target:", absUrl);

  const schedule = () => {
    if (closedByUser) return;
    attempt += 1;
    const base = Math.min(10000, 500 * Math.pow(2, attempt));
    const jitter = Math.random() * 300;
    const delay = base + jitter;
    h.onReconnect?.(attempt, delay);
    timer = window.setTimeout(connect, delay) as unknown as number;
  };
  const clear = () => { if (timer) window.clearTimeout(timer); timer = undefined; };

  const connect = () => {
    clear();
    try { ws = new WebSocket(absUrl); }
    catch (e) { if (import.meta.env.DEV) console.warn("[WS] ctor error", e); schedule(); return; }

    ws.onopen = (ev) => { connected = true; attempt = 0; h.onOpen?.(ev); };
    ws.onmessage = (ev) => { try { h.onMessage?.(JSON.parse(ev.data)); } catch {} };
    ws.onerror = (ev) => h.onError?.(ev);
    ws.onclose = (ev) => { connected = false; h.onClose?.(ev); if (import.meta.env.DEV) console.warn("[WS] closed", ev.code, ev.reason || "(no reason)"); clear(); schedule(); };
  };

  connect();
  return {
    close: () => { closedByUser = true; try { ws?.close(); } catch {} clear(); },
    isConnected: () => connected,
  };
}

// --- APIs específicas ---
// OPC: /ws/opc?name=<NOME>  ou  /ws/opc?all=true
export function openOpcWS(opts?: { name?: string; all?: boolean } & WSHandlers): WSClient {
  const q: string[] = [];
  if (opts?.name) q.push(`name=${encodeURIComponent(opts.name)}`);
  if (opts?.all || (!opts?.name)) q.push("all=true");
  const abs = wsUrlRoot(`/ws/opc?${q.join("&")}`);
  const { name, all, ...handlers } = opts || {};
  return openWS(abs, handlers);
}

// MPU: /ws/mpu?id=<ID>  ou  /ws/mpu?all=true
export function openMpuWS(opts?: { id?: string; all?: boolean } & WSHandlers): WSClient {
  const q: string[] = [];
  if (opts?.id) q.push(`id=${encodeURIComponent(opts.id)}`);
  if (opts?.all || (!opts?.id)) q.push("all=true");
  const abs = wsUrlRoot(`/ws/mpu?${q.join("&")}`);
  const { id, all, ...handlers } = opts || {};
  return openWS(abs, handlers);
}

// Snapshot (se usar): /api/ws/snapshot
export function openLiveWS(h: WSHandlers = {}): WSClient {
  const abs = wsUrlApi("/ws/snapshot");
  return openWS(abs, h);
}
