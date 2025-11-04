// src/context/LiveContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** ================== Types do backend ================== */
export type StableState = "RECUADO" | "AVANÇADO" | "DESCONHECIDO";
type PendingCmd = "AV" | "REC" | null;

export type LiveActuator = {
  id: number;
  state: StableState | string; // pode vir “AVANCADO” sem cedilha
  pending?: PendingCmd;
};

export type LiveMPU = { id: number; rms: number };

export type LivePayload = {
  type: "live";
  ts: string;
  actuators: LiveActuator[];
  mpu: LiveMPU[];
};

export type MonitoringPayload = {
  type: "monitoring";
  ts: string;
  timings: Array<{
    actuator_id: number;
    last: {
      dt_abre_s: number | null;
      dt_fecha_s: number | null;
      dt_ciclo_s: number | null;
    };
  }>;
  vibration: {
    window_s: number;
    items: Array<{ mpu_id: number; overall: number }>;
  };
};

export type SlowPayload = {
  type: "cpm";
  ts: string;
  window_s: number;
  items: Array<{ id: number; cycles: number; cpm: number; window_s: number }>;
};

export type AlertItem = {
  type: "alert";
  ts: string;
  code: string;
  severity: number;
  origin?: string;
  message: string;
  id?: number;
  status?: string;
  actuator_id?: number | null;
  details?: any;
};

/** ================== Helpers de URL (http -> ws) ================== */
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE?.replace(/\/+$/, "") ||
  "http://localhost:8000";

function toWS(path: string) {
  const isSecure = API_BASE.startsWith("https://");
  const proto = isSecure ? "wss" : "ws";
  const host = API_BASE.replace(/^https?:\/\//, "");
  return `${proto}://${host}${path}`;
}

/** ========= Helper p/ posição estável (0/1) a partir do estado ========= */
export function stateToPosTarget(state?: StableState | null): number {
  return state === "AVANÇADO" ? 1 : 0; // inclui DESCONHECIDO → 0 (fechado)
}

/** ========= Normalizador de estado (aceita sem acento/sinônimos) ========= */
function normalizeStableState(s: unknown): StableState {
  const raw = String(s ?? "").trim();
  // remove acentos (NFD) e deixa maiúsculo
  const v = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase(); // "AVANCADO", "RECUADO", "ABERTO", "FECHADO"...

  if (v === "AVANCADO" || v === "ABERTO" || v === "ABERTA") return "AVANÇADO";
  if (v === "RECUADO" || v === "FECHADO" || v === "FECHADA") return "RECUADO";
  return "DESCONHECIDO";
}

/** ================== WS Manager simples com backoff ================== */
class WSClient {
  url: string;
  onMessage: (ev: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: (ev: CloseEvent) => void;

  private ws: WebSocket | null = null;
  private wantOpen = false;
  private backoffMs = 500;
  private hbTimer: any = null;

  constructor(url: string, onMessage: (ev: MessageEvent) => void) {
    this.url = url;
    this.onMessage = onMessage;
  }

  open() {
    this.wantOpen = true;
    if (this.ws) return;
    this.connect();
  }

  private connect() {
    if (!this.wantOpen) return;
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this.backoffMs = 500;
        this.pingLoop();
        this.onOpen && this.onOpen();
      };
      this.ws.onmessage = (ev) => this.onMessage(ev);
      this.ws.onclose = (ev) => {
        this.clearPing();
        this.ws = null;
        this.onClose && this.onClose(ev);
        if (this.wantOpen) {
          setTimeout(() => this.connect(), this.backoffMs);
          this.backoffMs = Math.min(this.backoffMs * 1.8, 8000);
        }
      };
      this.ws.onerror = () => {
        try {
          this.ws?.close();
        } catch {}
      };
    } catch {
      setTimeout(() => this.connect(), this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 1.8, 8000);
    }
  }

  private pingLoop() {
    this.clearPing();
    this.hbTimer = setInterval(() => {
      try {
        this.ws?.send?.("hb");
      } catch {}
    }, 9000);
  }

  private clearPing() {
    if (this.hbTimer) {
      clearInterval(this.hbTimer);
      this.hbTimer = null;
    }
  }

  close() {
    this.wantOpen = false;
    this.clearPing();
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }
}

/** ================== Estado do Contexto ================== */
type LiveContextState = {
  snapshot: {
    ts: string | null;
    actuators: LiveActuator[];
    mpu: LiveMPU[];
  };
  timings: Record<
    number,
    { dt_abre_s: number | null; dt_fecha_s: number | null; dt_ciclo_s: number | null }
  >;
  cpm: Record<number, { cycles: number; cpm: number; window_s: number; ts: string }>;
  alerts: AlertItem[];
  getActuator: (id: number) => LiveActuator | undefined;
};

const LiveContext = createContext<LiveContextState | null>(null);

export const LiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ===== live =====
  const [liveTs, setLiveTs] = useState<string | null>(null);
  const [actuators, setActuators] = useState<LiveActuator[]>([]);
  const [mpu, setMpu] = useState<LiveMPU[]>([]);

  // ===== monitoring =====
  const timingsRef = useRef<
    Record<number, { dt_abre_s: number | null; dt_fecha_s: number | null; dt_ciclo_s: number | null }>
  >({});

  // ===== cpm =====
  const cpmRef = useRef<Record<number, { cycles: number; cpm: number; window_s: number; ts: string }>>(
    {}
  );

  // ===== alerts (compat) =====
  const alertsRef = useRef<AlertItem[]>([]);

  // throttling leve pro “live”
  const livePendingRef = useRef<LivePayload | null>(null);
  const liveFlushTimer = useRef<number | null>(null);

  const flushLive = useCallback(() => {
    const payload = livePendingRef.current;
    livePendingRef.current = null;
    if (!payload) return;
    setLiveTs(payload.ts);

    // ⚠️ Normaliza os estados que chegaram no WS
    const normActuators = (payload.actuators || []).map((a) => ({
      ...a,
      state: normalizeStableState(a.state),
    })) as LiveActuator[];

    setActuators(normActuators);
    setMpu(payload.mpu || []);
  }, []);

  const scheduleFlushLive = useCallback(() => {
    if (liveFlushTimer.current) return;
    liveFlushTimer.current = window.setTimeout(() => {
      liveFlushTimer.current = null;
      flushLive();
    }, 100);
  }, [flushLive]);

  // ===== Handlers de mensagens =====
  const onLiveMessage = useCallback(
    (ev: MessageEvent) => {
      try {
        const data: LivePayload = JSON.parse(ev.data);
        if (data?.type !== "live") return;

        // normaliza ANTES de enfileirar (garante consistência para quem ler livePendingRef)
        const norm = {
          ...data,
          actuators: (data.actuators || []).map((a) => ({
            ...a,
            state: normalizeStableState(a.state),
          })),
        } as LivePayload;

        livePendingRef.current = norm;
        scheduleFlushLive();
      } catch {}
    },
    [scheduleFlushLive]
  );

  const onMonitoringMessage = useCallback((ev: MessageEvent) => {
    try {
      const data: MonitoringPayload = JSON.parse(ev.data);
      if (data?.type !== "monitoring") return;

      const next: Record<
        number,
        { dt_abre_s: number | null; dt_fecha_s: number | null; dt_ciclo_s: number | null }
      > = { ...timingsRef.current };

      for (const t of data.timings || []) {
        next[t.actuator_id] = {
          dt_abre_s: t.last?.dt_abre_s ?? null,
          dt_fecha_s: t.last?.dt_fecha_s ?? null,
          dt_ciclo_s: t.last?.dt_ciclo_s ?? null,
        };
      }
      timingsRef.current = next;
    } catch {}
  }, []);

  const onSlowMessage = useCallback((ev: MessageEvent) => {
    try {
      const data: SlowPayload = JSON.parse(ev.data);
      if (data?.type !== "cpm") return;
      const next = { ...cpmRef.current };
      for (const it of data.items || []) {
        next[it.id] = { cycles: it.cycles, cpm: it.cpm, window_s: it.window_s, ts: data.ts };
      }
      cpmRef.current = next;
    } catch {}
  }, []);

  // ===== Conexões WS =====
  useEffect(() => {
    const wsLive = new WSClient(toWS("/ws/live"), onLiveMessage);
    const wsMon = new WSClient(toWS("/ws/monitoring"), onMonitoringMessage);
    const wsSlow = new WSClient(toWS("/ws/slow"), onSlowMessage);

    wsLive.open();
    wsMon.open();
    wsSlow.open();

    return () => {
      wsLive.close();
      wsMon.close();
      wsSlow.close();
    };
  }, [onLiveMessage, onMonitoringMessage, onSlowMessage]);

  // ===== snapshot memorizado =====
  const value = useMemo<LiveContextState>(
    () => ({
      snapshot: { ts: liveTs, actuators, mpu },
      timings: timingsRef.current,
      cpm: cpmRef.current,
      alerts: alertsRef.current,
      getActuator: (id: number) => (actuators || []).find((a) => a.id === id),
    }),
    [liveTs, actuators, mpu]
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
};

export function useLive(): LiveContextState {
  const ctx = useContext(LiveContext);
  if (!ctx) {
    throw new Error("useLive() must be used within <LiveProvider>");
  }
  return ctx;
}
