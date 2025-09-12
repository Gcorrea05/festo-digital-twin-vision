// src/lib/ws.ts
// Utilitários de WebSocket com reconexão exponencial + jitter
// Endpoints suportados (existentes no backend):
// - OPC:  ws(s)://<host>/ws/opc?name=<NOME>  |  /ws/opc?all=true
// - MPU:  ws(s)://<host>/ws/mpu?id=<ID>      |  /ws/mpu?all=true
// (mantemos openLiveWS para compatibilidade se você já usa em outro lugar)

export type LiveMessage = { type: "snapshot"; data: any } | any;

type WSHandlers = {
  onOpen?: (e: Event) => void;
  onMessage?: (m: any) => void;
  onError?: (e: Event) => void;
  onClose?: (e: CloseEvent) => void;
  onReconnect?: (attempt: number, delayMs: number) => void;
};

export type WSClient = { close: () => void; isConnected: () => boolean };

// -------- helpers --------
function getHttpBase(): string {
  const base = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (base && /^https?:\/\//i.test(base)) return base.replace(/\/+$/, "");
  return "http://127.0.0.1:8000";
}
function toWsUrl(path: string): string {
  // Em DEV, conecta direto no backend (evita proxy do Vite no Windows)
  if (import.meta.env.DEV) {
    const http = getHttpBase();
    const u = new URL(http);
    const proto = u.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${u.host}${path}`;
  }
  // Em PROD, mesma origem
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}

function openWS(path: string, h: WSHandlers = {}): WSClient {
  let ws: WebSocket | null = null;
  let connected = false;
  let attempt = 0;
  let closedByUser = false;
  let timer: number | undefined;

  const url = toWsUrl(path);
  if (import.meta.env.DEV) console.info("[WS] target:", url);

  const schedule = () => {
    if (closedByUser) return;
    attempt += 1;
    const base = Math.min(10000, 500 * Math.pow(2, attempt));
    const jitter = Math.random() * 300;
    const delay = base + jitter;
    h.onReconnect?.(attempt, delay);
    timer = window.setTimeout(connect, delay) as unknown as number;
  };
  const clear = () => {
    if (timer) window.clearTimeout(timer);
    timer = undefined;
  };

  const connect = () => {
    clear();
    try {
      ws = new WebSocket(url);
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[WS] ctor error", e);
      schedule();
      return;
    }
    ws.onopen = (ev) => {
      connected = true;
      attempt = 0;
      h.onOpen?.(ev);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        h.onMessage?.(msg);
      } catch {
        // ignora payloads não-JSON
      }
    };
    ws.onerror = (ev) => h.onError?.(ev);
    ws.onclose = (ev) => {
      connected = false;
      h.onClose?.(ev);
      if (import.meta.env.DEV) console.warn("[WS] closed", ev.code, ev.reason || "(no reason)");
      clear();
      schedule();
    };
  };

  connect();

  return {
    close: () => {
      closedByUser = true;
      try { ws?.close(); } catch {}
      clear();
    },
    isConnected: () => connected,
  };
}

// -------- APIs específicas --------

// OPC: /ws/opc?name=<NOME>  ou  /ws/opc?all=true
export function openOpcWS(opts?: { name?: string; all?: boolean } & WSHandlers): WSClient {
  const q: string[] = [];
  if (opts?.name) q.push(`name=${encodeURIComponent(opts.name)}`);
  if (opts?.all || (!opts?.name)) q.push("all=true");
  const path = `/ws/opc?${q.join("&")}`;
  const { name, all, ...handlers } = opts || {};
  return openWS(path, handlers);
}

// MPU: /ws/mpu?id=<ID>  ou  /ws/mpu?all=true
export function openMpuWS(opts?: { id?: string; all?: boolean } & WSHandlers): WSClient {
  const q: string[] = [];
  if (opts?.id) q.push(`id=${encodeURIComponent(opts.id)}`);
  if (opts?.all || (!opts?.id)) q.push("all=true");
  const path = `/ws/mpu?${q.join("&")}`;
  const { id, all, ...handlers } = opts || {};
  return openWS(path, handlers);
}
// (Opcional/legado) Live snapshot se você ainda usa em algum lugar.
// Ajuste a rota se seu backend NÃO tiver /api/ws/snapshot.
export function openLiveWS(h: WSHandlers = {}): WSClient {
  // Se a sua API não tem esse endpoint, você pode remover
  // ou trocar por outro path. Mantive por compatibilidade.
  const path = "/api/ws/snapshot";
  return openWS(path, h);
}
