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
  ts: string; // instante (ISO) do último pacote aplicado
  state: StableState;
  // campos opcionais
  pending?: "AV" | "REC" | null;
  fault?: string | null;
  // NOVO: vira true após a 1ª borda AVANÇADO->RECUADO (não volta a false)
  hasStarted?: boolean;
};

export type Snapshot = {
  ts?: string; // instante global do último pacote (ISO)
  system: {
    status: "ok" | "degraded" | "offline";
    ts: number; // epoch ms de quando o snapshot foi composto
  };
  actuators: ActuatorSnapshot[];
  /** Novo: amostra leve do MPU (RMS) vinda do /ws/live quando disponível */
  mpu?: { id: number; rms: number }[];
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

// Consideramos "ok" se chegou pacote/heartbeat há <= 5s; depois cai para degraded/offline
const FRESH_MS = 5000;

// -------- Singleton de aba (evita múltiplas conexões se o provider montar duas vezes) -------
let _tabSingletonWs: ReturnType<typeof openLiveWS> | null = null;
let _tabSingletonRefCount = 0;

export function LiveProvider({ children }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<LiveMode>("live");

  // seleção opcional (usado pela UI)
  const [selectedActuator, _setSelectedActuator] = useState<1 | 2 | undefined>(undefined);
  const setSelectedActuator = (id: 1 | 2 | null) =>
    _setSelectedActuator(id == null ? undefined : id);

  // guarda o "último tick" (serve para pacotes live **ou** heartbeats hb)
  const lastTickRef = useRef<number>(0);

  // proteção a duplicatas/out-of-order (comparando timestamp do pacote)
  const lastAppliedIsoRef = useRef<string | null>(null);
  const lastAppliedMsRef = useRef<number>(0);

  // estado anterior por atuador (pra detectar borda AV->RE)
  const lastStateRef = useRef<Map<number, StableState>>(new Map());

  // flag “destravou” por atuador (persiste até reload)
  const hasStartedRef = useRef<Map<number, boolean>>(new Map());

  // guardamos WS da aba (pode ser o singleton)
  const wsRef = useRef<ReturnType<typeof openLiveWS> | null>(null);
  const guardTimerRef = useRef<number | null>(null);

  // para cancelar getHealth se desmontar
  const healthAbortRef = useRef<AbortController | null>(null);

  // aplica/mescla atuadores no snapshot mantendo os antigos se não vierem no pacote
  const upsertActuators = (incoming: ActuatorSnapshot[], ts: string) => {
    setSnapshot((prev) => {
      const prevList = prev?.actuators ?? [];
      const map = new Map<number, ActuatorSnapshot>();
      // base: antigos
      for (const a of prevList) map.set(a.id, a);
      // aplica novos (com ts do pacote)
      for (const a of incoming) {
        const prevA = map.get(a.id);
        map.set(a.id, {
          ...(prevA ?? {}),
          ...a,
          ts,
          // preserva hasStarted=true se já estava marcado antes
          hasStarted: (prevA?.hasStarted || a.hasStarted) ? true : false,
        } as ActuatorSnapshot);
      }
      const merged = Array.from(map.values()).sort((x, y) => x.id - y.id);
      return {
        ts,
        system: { status: prev?.system.status ?? "ok", ts: Date.now() },
        actuators: merged,
        // preserva mpu existente (será atualizado no applyLiveMessage se vier no pacote)
        ...(prev?.mpu ? { mpu: prev.mpu } : {}),
        ...(selectedActuator ? { selectedActuator } : {}),
      };
    });
  };

  // aplica uma mensagem de /ws/live ao snapshot, com proteção a duplicatas/out-of-order
  const applyLiveMessage = (msg: WSMessageLive) => {
  const ts = String(msg?.ts ?? new Date().toISOString());
  const tsMs = Number.isFinite(Date.parse(ts)) ? Date.parse(ts) : Date.now();

  // ignora duplicados/out-of-order
  if (lastAppliedIsoRef.current === ts) return;
  if (tsMs <= lastAppliedMsRef.current) return;

  lastAppliedIsoRef.current = ts;
  lastAppliedMsRef.current = tsMs;
  lastTickRef.current = Date.now();

  // === Normaliza atuadores ===
  const arr = Array.isArray(msg?.actuators) ? msg.actuators : [];
  const normalized: ActuatorSnapshot[] = arr
    .map((a) => {
      const id = Number((a as any).id);
      if (!Number.isFinite(id)) return null;
      const state = ((a as any).state ?? "DESCONHECIDO") as StableState;
      const prevState = lastStateRef.current.get(id);
      if (state && state !== "DESCONHECIDO") {
        lastStateRef.current.set(id, state);
      }
      const firstEdge =
        prevState === "AVANÇADO" &&
        state === "RECUADO" &&
        hasStartedRef.current.get(id) !== true;
      if (firstEdge) hasStartedRef.current.set(id, true);
      const hasStarted = hasStartedRef.current.get(id) === true;

      return {
        id,
        ts,
        state,
        pending: (a as any).pending ?? null,
        fault: (a as any).fault ?? null,
        hasStarted,
      } as ActuatorSnapshot;
    })
    .filter(Boolean) as ActuatorSnapshot[];

  // === RMS leve opcional do MPU ===
  const mpuLive = Array.isArray((msg as any).mpu)
    ? (msg as any).mpu
        .map((m: any) => ({
          id: Number(m.id),
          rms: Number(m.rms ?? m.overall ?? 0),
        }))
        .filter((x: any) => Number.isFinite(x.id))
    : undefined;

  // === Atualiza tudo em um único setSnapshot ===
  setSnapshot((prev) => {
    const prevList = prev?.actuators ?? [];
    const map = new Map<number, ActuatorSnapshot>();
    for (const a of prevList) map.set(a.id, a);
    for (const a of normalized) {
      const prevA = map.get(a.id);
      map.set(a.id, {
        ...(prevA ?? {}),
        ...a,
        ts,
        hasStarted: (prevA?.hasStarted || a.hasStarted) ? true : false,
      });
    }

    const merged = Array.from(map.values()).sort((x, y) => x.id - y.id);
    const base: Snapshot = {
      ts,
      system: { status: "ok", ts: Date.now() },
      actuators: merged,
      ...(selectedActuator ? { selectedActuator } : {}),
    };

    if (mpuLive) base.mpu = mpuLive;
    else if (prev?.mpu) base.mpu = prev.mpu;

    return base;
  });
};

  // status inicial via /api/health (best-effort)
  useEffect(() => {
    const ctrl = new AbortController();
    healthAbortRef.current = ctrl;
    getHealth()
      .then((h) => {
        if (ctrl.signal.aborted) return;
        const st = String(h?.status ?? "unknown").toLowerCase();
        const status: "ok" | "degraded" | "offline" =
          st === "ok" ? "ok" : st === "degraded" ? "degraded" : st === "offline" ? "offline" : "degraded";
        setSnapshot((prev) => ({
          ts: prev?.ts,
          system: { status, ts: Date.now() },
          actuators: prev?.actuators ?? [],
          ...(prev?.mpu ? { mpu: prev.mpu } : {}),
          ...(selectedActuator ? { selectedActuator } : {}),
        }));
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setSnapshot((prev) => ({
          ts: prev?.ts,
          system: { status: "offline", ts: Date.now() },
          actuators: prev?.actuators ?? [],
          ...(prev?.mpu ? { mpu: prev.mpu } : {}),
          ...(selectedActuator ? { selectedActuator } : {}),
        }));
      });
    return () => {
      ctrl.abort();
      healthAbortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Abre/fecha o WS conforme o modo
  useEffect(() => {
    if (mode !== "live") {
      // modo playback: garante que WS está fechado
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        // singleton da aba
        if (_tabSingletonWs) {
          _tabSingletonRefCount = Math.max(0, _tabSingletonRefCount - 1);
          if (_tabSingletonRefCount === 0) {
            _tabSingletonWs.close();
            _tabSingletonWs = null;
          }
        }
      }
      // marca como degraded enquanto sem WS (playback ainda pode injetar snapshots)
      setSnapshot((prev) =>
        prev ? { ...prev, system: { status: "degraded", ts: Date.now() } } : prev
      );
      return; // não abre WS
    }

    // --- LIVE: abre singleton de aba ou reutiliza ---
    if (_tabSingletonWs) {
      _tabSingletonRefCount += 1;
      wsRef.current = _tabSingletonWs;
      // degrade até a 1ª msg/heartbeat
      setSnapshot((prev) => ({
        ts: prev?.ts,
        system: { status: "degraded", ts: Date.now() },
        actuators: prev?.actuators ?? [],
        ...(prev?.mpu ? { mpu: prev.mpu } : {}),
        ...(selectedActuator ? { selectedActuator } : {}),
      }));
    } else {
      const ws = openLiveWS({
        onOpen: () => {
          setSnapshot((prev) => ({
            ts: prev?.ts,
            system: { status: "degraded", ts: Date.now() }, // até 1º live/hb
            actuators: prev?.actuators ?? [],
            ...(prev?.mpu ? { mpu: prev.mpu } : {}),
            ...(selectedActuator ? { selectedActuator } : {}),
          }));
        },
        onMessage: (m: AnyWSMessage) => {
          // aceita {type:"live"} e {type:"hb", channel:"live"}
          if (m?.type === "live") applyLiveMessage(m as WSMessageLive);
          else if (m?.type === "hb" && (m as any).channel === "live") applyHeartbeat();
        },
        onClose: () => {
          setSnapshot((prev) =>
            prev ? { ...prev, system: { status: "degraded", ts: Date.now() } } : prev
          );
        },
        onError: () => {
          setSnapshot((prev) =>
            prev ? { ...prev, system: { status: "degraded", ts: Date.now() } } : prev
          );
        },
      });

      _tabSingletonWs = ws;
      _tabSingletonRefCount = 1;
      wsRef.current = ws;
    }

    return () => {
      // solta referência ao singleton ao desmontar/trocar modo
      if (_tabSingletonRefCount > 0) {
        _tabSingletonRefCount -= 1;
        if (_tabSingletonRefCount === 0 && _tabSingletonWs) {
          _tabSingletonWs.close();
          _tabSingletonWs = null;
        }
      }
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Guard de “frescor” para degradação/offline se parar de chegar live/hb
  useEffect(() => {
    // @ts-ignore
    guardTimerRef.current = window.setInterval(() => {
      const last = lastTickRef.current;
      const age = last ? Date.now() - last : Infinity;

      setSnapshot((prev) => {
        if (!prev) return prev;
        if (age <= FRESH_MS) {
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
      prev
        ? {
            ...prev,
            ...(selectedActuator
              ? { selectedActuator }
              : { selectedActuator: undefined }),
          }
        : prev
    );
  }, [selectedActuator]);

  const value = useMemo<LiveContextValue>(
    () => ({ snapshot, mode, setMode, setSelectedActuator }),
    [snapshot, mode]
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
