// src/context/LiveContext.tsx
// Contexto global para snapshot live/playback
// POLLING-ONLY (sem WebSocket) + system.components do backend

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";

import {
  getHealth,
  getLiveActuatorsState, // traz system.status + facets/cpm/cycles por atuador (helper do api.ts)
  getMpuIds,
  getLatestMPU,
  getSystemStatus, // status de componentes calculado no backend
} from "@/lib/api";

export type LiveMode = "live" | "playback";

type Facets = { S1: 0 | 1; S2: 0 | 1 };

export type ActuatorSnapshot = {
  id: number;
  ts: string;
  fsm: { state: string; error_code?: string | number };
  facets: Facets;
  cpm: number;
  rms: number;
  // opcionais para contagem de ciclos (não afeta quem não usa)
  cycles?: number;
  totalCycles?: number;
};

export type Snapshot = {
  system: {
    status: "ok" | "down" | "unknown";
    ts: number;
    components?: {
      actuators?: string;
      sensors?: string;
      transmission?: string;
      control?: string;
    };
  };
  actuators: ActuatorSnapshot[];
  mpu?: {
    ts: string;
    id: string;
    ax: number;
    ay: number;
    az: number;
    gx: number;
    gy: number;
    gz: number;
    temp_c: number;
  } | null;
  // opcional para filtro relativo no Dashboard
  selectedActuator?: 1 | 2;
};

type LiveContextValue = {
  snapshot: Snapshot | null;
  mode: LiveMode;
  setMode: (m: LiveMode) => void;
  // novo: expõe setter do filtro (1|2|null para limpar)
  setSelectedActuator: (id: 1 | 2 | null) => void;
};

const LiveContext = createContext<LiveContextValue | undefined>(undefined);

export function useLive(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be inside LiveProvider");
  return ctx;
}

type Props = { children: ReactNode };

// ---- helpers ----
function normSystemStatus(s: any): "ok" | "down" | "unknown" {
  const v = String(s ?? "").toLowerCase();
  if (v.includes("ok") || v.includes("operational")) return "ok";
  if (v.includes("down") || v.includes("offline")) return "down";
  return "unknown";
}

// Regra sem transições: só aberto/fechado/indef/erro
function decideFsmState(f: { S1: 0 | 1; S2: 0 | 1 }): string {
  const s1 = f.S1, s2 = f.S2;
  if (s1 === 1 && s2 === 0) return "fechado";
  if (s2 === 1 && s1 === 0) return "aberto";
  if (s1 === 1 && s2 === 1) return "erro";
  return "indef";
}
export function LiveProvider({ children }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<LiveMode>("live");

  // estado de filtro por atuador (undefined = sem filtro)
  const [selectedActuator, _setSelectedActuator] = useState<1 | 2 | undefined>(undefined);
  const setSelectedActuator = (id: 1 | 2 | null) =>
    _setSelectedActuator(id == null ? undefined : id);

  // Estados parciais para compor o snapshot
  const [systemStatus, setSystemStatus] = useState<"ok" | "down" | "unknown">("unknown");
  const [systemComponents, setSystemComponents] = useState<Snapshot["system"]["components"]>(
    undefined
  );
  const [actuators, setActuators] = useState<ActuatorSnapshot[]>([]);
  const [mpu, setMpu] = useState<Snapshot["mpu"]>(null);
  const mpuChosenIdRef = useRef<string | null>(null);

  // -------- Poll 1: System + Actuators + Ciclos/CPM (500 ms) --------
  useEffect(() => {
    if (mode !== "live") return;
    let timer: number | null = null;
    let cancelled = false;

    const tick = async () => {
      try {
        // live agrega dados de atuadores e status básico
        const live = await getLiveActuatorsState().catch(async () => {
          const h = await getHealth().catch(() => ({ status: "offline" }));
          return {
            ts: new Date().toISOString(),
            system: { status: (h?.status ?? "offline").toString() },
            actuators: [] as any[],
          };
        });

        // componentes de sistema calculados no backend
        let comps: Snapshot["system"]["components"] = undefined;
        try {
          const sys = await getSystemStatus();
          comps = sys?.components ?? undefined;
        } catch {
          comps = undefined;
        }

        const sys = normSystemStatus(live?.system?.status);
        const tsNow = new Date().toISOString();

        const acts: ActuatorSnapshot[] = (live?.actuators ?? [])
          .map((a: any) => {
            const id = Number(a?.id ?? a?.actuator_id ?? 0);
            if (!id) return null;

            // facets boolean|null -> 0|1 (espera estrutura {S1,S2}; se vier recuado/avancado, fallback)
            const s1b = a?.facets?.S1 ?? (a?.recuado ?? null);
            const s2b = a?.facets?.S2 ?? (a?.avancado ?? null);
            const to01 = (v: any) => (v === true || v === 1 ? 1 : v === false || v === 0 ? 0 : 0);

            const facets: Facets = { S1: to01(s1b) as 0 | 1, S2: to01(s2b) as 0 | 1 };

            // cycles/totalCycles se vierem; fallback para cpm (compat)
            const cycles = Number((a?.cycles ?? a?.totalCycles ?? a?.cpm ?? 0) as number);

            return {
              id,
              ts: tsNow,
              fsm: { state: decideFsmState(facets) },
              facets,
              cpm: Number(a?.cpm ?? cycles ?? 0),
              rms: 0,
              cycles,
              totalCycles: cycles,
            } as ActuatorSnapshot;
          })
          .filter(Boolean) as ActuatorSnapshot[];

        if (!cancelled) {
          setSystemStatus(sys);
          setSystemComponents(comps);
          setActuators(acts);
        }
      } catch {
        if (!cancelled) {
          setSystemStatus("down");
          setSystemComponents(undefined);
          setActuators([]);
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(tick, 500) as unknown as number;
        }
      }
    };

    tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [mode]);
  // -------- Poll 2: MPU latest (1 s) --------
  useEffect(() => {
    if (mode !== "live") return;
    let timer: number | null = null;
    let cancelled = false;

    const discoverAndTick = async () => {
      try {
        if (!mpuChosenIdRef.current) {
          const ids = await getMpuIds().catch(() => []);
          if (ids && ids.length) {
            mpuChosenIdRef.current = String(ids[0]);
          }
        }
        if (mpuChosenIdRef.current) {
          const raw = await getLatestMPU(mpuChosenIdRef.current as any).catch(() => null);
          if (!cancelled) {
            if (!raw) {
              setMpu(null);
            } else {
              setMpu({
                ts: String(raw.ts_utc ?? new Date().toISOString()),
                id: String(raw.id ?? "MPU"),
                ax: Number(raw.ax ?? 0),
                ay: Number(raw.ay ?? 0),
                az: Number(raw.az ?? 0),
                gx: Number((raw as any).gx ?? (raw as any).gx_dps ?? 0),
                gy: Number((raw as any).gy ?? (raw as any).gy_dps ?? 0),
                gz: Number((raw as any).gz ?? (raw as any).gz_dps ?? 0),
                temp_c: Number((raw as any).temp_c ?? 0),
              });
            }
          }
        }
      } catch {
        if (!cancelled) setMpu(null);
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(discoverAndTick, 1000) as unknown as number;
        }
      }
    };

    discoverAndTick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [mode]);

  // -------- Composer: monta o Snapshot final quando algo muda --------
  useEffect(() => {
    if (mode !== "live") return;
    const snap: Snapshot = {
      system: { status: systemStatus, ts: Date.now(), components: systemComponents },
      actuators,
      mpu,
      ...(selectedActuator ? { selectedActuator } : {}),
    };
    setSnapshot(snap);
  }, [mode, systemStatus, systemComponents, actuators, mpu, selectedActuator]);

  return (
    <LiveContext.Provider
      value={{
        snapshot,
        mode,
        setMode,
        setSelectedActuator, // expõe para 3D/LiveMetrics
      }}
    >
      {children}
    </LiveContext.Provider>
  );
}
