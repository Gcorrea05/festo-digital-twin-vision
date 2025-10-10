// src/context/LiveContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";

import {
  openLiveWS,
  type AnyWSMessage,
  type WSMessageLive,
  getHealth,
} from "@/lib/api";

// ===================
// Tipos (WS-first)
// ===================

export type LiveMode = "live" | "playback";

export type StableState = "RECUADO" | "AVANÇADO" | "DESCONHECIDO";

export type ActuatorSnapshot = {
  id: number;
  ts: string;                // instante (ISO) do último pacote aplicado
  state: StableState;
  // futuros campos opcionais (se o backend passar no live):
  pending?: "AV" | "REC" | null;
  fault?: string | null;
};

export type Snapshot = {
  ts?: string;               // instante global do último pacote (ISO)
  system: {
    status: "ok" | "degraded" | "offline";
    ts: number;              // epoch ms de quando o snapshot foi composto
  };
  actuators: ActuatorSnapshot[];
  selectedActuator?: 1 | 2;
};

type LiveContextValue = {
  snapshot: Snapshot | null;
  mode: LiveMode;
  setMode: (m: LiveMode) => void;
  setSelectedActuator: (id: 1 | 2 | null) => void;
};

// ===================
// Contexto
// ===================
const LiveContext = createContext<LiveContextValue | undefined>(undefined);

export function useLive(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be inside LiveProvider");
  return ctx;
}

type Props = { children: ReactNode };

// ===================
// Implementação
// ===================

// Consideramos "ok" se chegou pacote há <= 5s; depois cai para degraded/offline
const FRESH_MS = 5000;

export function LiveProvider({ children }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<LiveMode>("live");

  // seleção opcional (usado pela UI)
  const [selectedActuator, _setSelectedActuator] = useState<1 | 2 | undefined>(undefined);
  const setSelectedActuator = (id: 1 | 2 | null) =>
    _setSelectedActuator(id == null ? undefined : id);

  // guarda o "último tick" para o guard de frescor
  const lastTickRef = useRef<number>(0);
  const wsRef = useRef<ReturnType<typeof openLiveWS> | null>(null);
  const guardTimerRef = useRef<number | null>(null);

  // aplica uma mensagem de /ws/live ao snapshot
  const applyLiveMessage = (msg: WSMessageLive) => {
    const ts = String(msg?.ts ?? new Date().toISOString());
    const arr = Array.isArray(msg?.actuators) ? msg.actuators : [];

    // normaliza/minimiza o shape (apenas o que precisamos no live)
    const normalized: ActuatorSnapshot[] = arr
      .map((a) => {
        const id = Number((a as any).id);
        if (!Number.isFinite(id)) return null;
        const state = ((a as any).state ?? "DESCONHECIDO") as StableState;
        return {
          id,
          ts,
          state,
          // compat opcional com futuros campos no live:
          pending: (a as any).pending ?? null,
          fault: (a as any).fault ?? null,
        } as ActuatorSnapshot;
      })
      .filter(Boolean) as ActuatorSnapshot[];

    // ordena por id para estabilidade de render
    normalized.sort((x, y) => x.id - y.id);

    lastTickRef.current = Date.now();

    setSnapshot({
      ts,
      system: { status: "ok", ts: Date.now() },
      actuators: normalized,
      ...(selectedActuator ? { selectedActuator } : {}),
    });
  };

  // Abre o WS de live ao montar (com fallback de snapshot já embutido no openLiveWS)
  useEffect(() => {
    // status inicial via /api/health (best-effort)
    getHealth()
      .then((h) => {
        const st = String(h?.status ?? "unknown").toLowerCase();
        const status: "ok" | "degraded" | "offline" =
          st === "ok" ? "ok" : st === "degraded" ? "degraded" : st === "offline" ? "offline" : "degraded";
        setSnapshot((prev) => ({
          ts: prev?.ts,
          system: { status, ts: Date.now() },
          actuators: prev?.actuators ?? [],
          ...(selectedActuator ? { selectedActuator } : {}),
        }));
      })
      .catch(() => {
        setSnapshot((prev) => ({
          ts: prev?.ts,
          system: { status: "offline", ts: Date.now() },
          actuators: prev?.actuators ?? [],
          ...(selectedActuator ? { selectedActuator } : {}),
        }));
      });

    const ws = openLiveWS({
      onOpen: () => {
        // durante o handshake consideramos "degraded" até chegar a 1ª msg
        setSnapshot((prev) => ({
          ts: prev?.ts,
          system: { status: "degraded", ts: Date.now() },
          actuators: prev?.actuators ?? [],
          ...(selectedActuator ? { selectedActuator } : {}),
        }));
      },
      onMessage: (m: AnyWSMessage) => {
        if (m.type === "live") applyLiveMessage(m as WSMessageLive);
      },
      onClose: () => {
        // sem conexão WS ativa (fallback de snapshot pode assumir). Marcar como degraded por enquanto.
        setSnapshot((prev) => ({
          ts: prev?.ts,
          system: { status: "degraded", ts: Date.now() },
          actuators: prev?.actuators ?? [],
          ...(selectedActuator ? { selectedActuator } : {}),
        }));
      },
      onError: () => {
        // erro não implica offline imediato; deixe como degraded
        setSnapshot((prev) => ({
          ts: prev?.ts,
          system: { status: "degraded", ts: Date.now() },
          actuators: prev?.actuators ?? [],
          ...(selectedActuator ? { selectedActuator } : {}),
        }));
      },
    });

    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guard de “frescor” para degradação/offline se parar de chegar live
  useEffect(() => {
    // @ts-ignore
    guardTimerRef.current = window.setInterval(() => {
      const last = lastTickRef.current;
      if (!last) return;
      const age = Date.now() - last;
      setSnapshot((prev) => {
        if (!prev) return prev;
        if (age <= FRESH_MS) {
          // ok recente, nada a fazer
          return prev.system.status === "ok"
            ? prev
            : { ...prev, system: { status: "ok", ts: Date.now() } };
        }
        // acima do fresh: primeiro degraded, depois offline
        if (prev.system.status === "ok") {
          return { ...prev, system: { status: "degraded", ts: Date.now() } };
        }
        if (prev.system.status === "degraded") {
          return { ...prev, system: { status: "offline", ts: Date.now() } };
        }
        return prev;
      });
    }, Math.max(1000, Math.floor(FRESH_MS / 2)));

    return () => {
      if (guardTimerRef.current != null) {
        // @ts-ignore
        window.clearInterval(guardTimerRef.current);
        guardTimerRef.current = null;
      }
    };
  }, []);

  // Reaplica selectedActuator no snapshot quando mudar
  useEffect(() => {
    setSnapshot((prev) =>
      prev ? { ...prev, ...(selectedActuator ? { selectedActuator } : { selectedActuator: undefined }) } : prev
    );
  }, [selectedActuator]);

  const value = useMemo<LiveContextValue>(
    () => ({ snapshot, mode, setMode, setSelectedActuator }),
    [snapshot, mode]
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
