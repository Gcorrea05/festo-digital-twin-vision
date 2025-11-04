// src/hooks/useActuatorsLive.ts
import { useEffect, useRef, useState } from "react";

/** Shape legado que os componentes esperam */
export type ActuatorLiveItem = {
  id?: 1 | 2 | number;
  actuator_id?: 1 | 2 | number;
  state: string;                 // "RECUADO" | "AVANCADO"
  pending: string | null;        // "AV" | "REC" | null  (mantemos null por ora)
  fault?: string | null;
  elapsed_ms?: number;
  started_at?: string | null;
};

export type LiveState = {
  ts: string;                    // ISO
  actuators: ActuatorLiveItem[]; // [{id:1,...},{id:2,...}]
} | null;

/* ===========================
   WS singleton (sem polling)
   =========================== */

type LiveWsMsg = {
  type: "live" | "hb";
  ts_ms?: number;
  snapshot?: boolean;
  a1?: {
    state?: string | null;          // compat do backend
    state_ascii?: "AVANCADO" | "RECUADO" | null;
    is_avancado?: boolean;
    is_recuado?: boolean;
    s1?: number; s2?: number;
  };
  a2?: {
    state?: string | null;
    state_ascii?: "AVANCADO" | "RECUADO" | null;
    is_avancado?: boolean;
    is_recuado?: boolean;
    s1?: number; s2?: number;
  };
};

let wsRef: WebSocket | null = null;
let listeners = new Set<(s: LiveState) => void>();
let cache: LiveState = null;
let reconnectTimer: number | null = null;
let lastHash = ""; // dedupe

function normAscii(s: string | null | undefined): "AVANCADO" | "RECUADO" | null {
  if (!s) return null;
  const x = s.replace("Ç", "C");
  if (x === "AVANCADO") return "AVANCADO";
  if (x === "RECUADO") return "RECUADO";
  return null;
}

function wsBase(): string {
  // tenta usar a mesma origem do front
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  const host = loc.host; // inclui porta
  return `${proto}//${host}`;
}

function buildWsUrl(): string {
  return `${wsBase()}/ws/live`;
}

function publish(next: LiveState) {
  // dedupe raso por hash
  const key = JSON.stringify(next);
  if (key === lastHash) return;
  lastHash = key;

  cache = next;
  listeners.forEach((fn) => fn(cache));
}

function toLegacyState(msg: LiveWsMsg): LiveState | null {
  if (msg.type !== "live") return cache; // ignora 'hb'
  const ts = msg.ts_ms ? new Date(msg.ts_ms).toISOString() : new Date().toISOString();

  // a1
  const s1 = normAscii(msg.a1?.state_ascii ?? (msg.a1?.state ?? null));
  const a1: ActuatorLiveItem = {
    id: 1,
    actuator_id: 1,
    state: s1 ?? "",
    pending: null,
    fault: null,
    started_at: null,
  };

  // a2
  const s2 = normAscii(msg.a2?.state_ascii ?? (msg.a2?.state ?? null));
  const a2: ActuatorLiveItem = {
    id: 2,
    actuator_id: 2,
    state: s2 ?? "",
    pending: null,
    fault: null,
    started_at: null,
  };

  return {
    ts,
    actuators: [a1, a2],
  };
}

function connect() {
  if (wsRef) return;
  const url = buildWsUrl();
  const ws = new WebSocket(url);
  wsRef = ws;

  ws.onopen = () => {
    // limpa backoff pendente
    if (reconnectTimer != null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (ev) => {
    try {
      const msg: LiveWsMsg = JSON.parse(ev.data);
      if (msg.type !== "live") return;

      const state = toLegacyState(msg);
      publish(state);
    } catch {
      // ignora payload inválido
    }
  };

  ws.onclose = () => {
    wsRef = null;
    // backoff leve (sem polling HTTP)
    if (reconnectTimer == null) {
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 800);
    }
  };

  ws.onerror = () => {
    try { ws.close(); } catch {}
  };
}

function ensureConnected() {
  if (!wsRef) connect();
}

/* ============
   Hook público
   ============ */
export function useActuatorsLive() {
  const [state, setState] = useState<LiveState>(cache);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    const listener = (s: LiveState) => {
      if (!mountedRef.current) return;
      setState(s);
    };

    listeners.add(listener);
    ensureConnected();

    return () => {
      mountedRef.current = false;
      listeners.delete(listener);
      // não fechamos o WS aqui para manter singleton compartilhado
    };
  }, []);

  return state;
}
