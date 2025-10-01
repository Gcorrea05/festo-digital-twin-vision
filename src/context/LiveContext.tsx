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
  getLiveActuatorsState, // helper do api.ts (traz system.status + actuators)
  getMpuIds,
  getLatestMPU,
} from "@/lib/api";

export type LiveMode = "live" | "playback";

type Facets = { S1: 0 | 1; S2: 0 | 1 };

export type ActuatorSnapshot = {
  id: number;
  ts: string;
  fsm: { state: string; error_code?: string | number };
  facets: Facets;            // S1=Recuado, S2=Avançado (0/0 = transição)
  cpm: number;
  rms: number;
  // opcionais para contagem de ciclos
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
    /** ISO UTC do início do processo no backend (para runtime) */
    started_at?: string;
    /** runtime em milissegundos, calculado no front com base em started_at */
    runtime_ms?: number;
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
  selectedActuator?: 1 | 2;
};

type LiveContextValue = {
  snapshot: Snapshot | null;
  mode: LiveMode;
  setMode: (m: LiveMode) => void;
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
  return "indef"; // 0/0
}

export function LiveProvider({ children }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<LiveMode>("live");

  // filtro por atuador (undefined = sem filtro)
  const [selectedActuator, _setSelectedActuator] = useState<1 | 2 | undefined>(undefined);
  const setSelectedActuator = (id: 1 | 2 | null) =>
    _setSelectedActuator(id == null ? undefined : id);

  // Estados parciais para compor o snapshot
  const [systemStatus, setSystemStatus] = useState<"ok" | "down" | "unknown">("unknown");
  const [systemComponents, setSystemComponents] = useState<Snapshot["system"]["components"]>(undefined);
  const [startedAt, setStartedAt] = useState<string | undefined>(undefined);
  const [runtimeMs, setRuntimeMs] = useState<number | undefined>(undefined);

  const [actuators, setActuators] = useState<ActuatorSnapshot[]>([]);
  const [mpu, setMpu] = useState<Snapshot["mpu"]>(null);
  const mpuChosenIdRef = useRef<string | null>(null);

  // --- memória local: último estado estável por atuador (evita “—”/piscadas em 0/0) ---
  const lastStableRef = useRef<Record<number, "ABERTO" | "RECUADO" | undefined>>({});

  // -------- Poll 1: System + Actuators + Ciclos/CPM (400 ms) --------
  useEffect(() => {
    if (mode !== "live") return;
    let timer: number | null = null;
    let cancelled = false;

    const tick = async () => {
      try {
        const live = await getLiveActuatorsState().catch(async () => {
          const h = await getHealth().catch(() => ({ status: "offline" }));
          return {
            ts: new Date().toISOString(),
            system: { status: (h?.status ?? "offline").toString() },
            actuators: [] as any[],
          };
        });

        const sys = normSystemStatus(live?.system?.status);
        const tsNow = new Date().toISOString();

        const acts: ActuatorSnapshot[] = (live?.actuators ?? [])
          .map((a: any) => {
            const id = Number(a?.id ?? a?.actuator_id ?? 0);
            if (!id) return null;

            // 1) tenta deduzir facets a partir de state textual
            const st = String(a?.state ?? "").toUpperCase(); // RECUADO | AVANÇADO
            let facetsFromState: Facets | null = null;
            if (st.includes("RECU")) facetsFromState = { S1: 1, S2: 0 };
            else if (st.includes("AVAN")) facetsFromState = { S1: 0, S2: 1 };

            // 2) fallback p/ legado (facets/recuado/avancado)
            const to01 = (v: any) => (v === true || v === 1 ? 1 : v === false || v === 0 ? 0 : 0);
            const s1b = a?.facets?.S1 ?? a?.recuado ?? null;
            const s2b = a?.facets?.S2 ?? a?.avancado ?? null;
            let facets: Facets = facetsFromState ?? { S1: to01(s1b) as 0 | 1, S2: to01(s2b) as 0 | 1 };

            // 3) transição (0/0): mantenha último estável conhecido
            if (facets.S1 === 0 && facets.S2 === 0 && lastStableRef.current[id]) {
              // nada a mudar — as telas usarão o estável como display
            } else if (facets.S1 === 1 && facets.S2 === 0) {
              lastStableRef.current[id] = "RECUADO";
            } else if (facets.S1 === 0 && facets.S2 === 1) {
              lastStableRef.current[id] = "ABERTO";
            }

            const cyclesNum = Number(a?.totalCycles ?? a?.cycles ?? 0);

            return {
              id,
              ts: tsNow,
              fsm: { state: decideFsmState(facets) },
              facets,
              cpm: Number(a?.cpm ?? 0),
              rms: 0,
              cycles: cyclesNum,
              totalCycles: cyclesNum,
            } as ActuatorSnapshot;
          })
          .filter(Boolean) as ActuatorSnapshot[];

        if (!cancelled) {
          setSystemStatus(sys);
          setSystemComponents(undefined);

          // evita renders desnecessários
          setActuators((prev) => {
            const sameLen = prev.length === acts.length;
            const same =
              sameLen &&
              prev.every((p, i) => {
                const n = acts[i];
                return (
                  p.id === n.id &&
                  p.facets.S1 === n.facets.S1 &&
                  p.facets.S2 === n.facets.S2 &&
                  p.fsm.state === n.fsm.state &&
                  p.cpm === n.cpm &&
                  p.totalCycles === n.totalCycles
                );
              });
            return same ? prev : acts;
          });
        }
      } catch {
        if (!cancelled) {
          setSystemStatus("down");
          setSystemComponents(undefined);
          setActuators([]);
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(tick, 400) as unknown as number; // 0,4s
        }
      }
    };

    tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [mode]);

  // -------- Poll 1.1: Health (status + started_at) a cada 5s --------
  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    const pull = async () => {
      try {
        const h = await getHealth();
        if (cancelled) return;
        const status = normSystemStatus(h?.status);
        setSystemStatus(status);
        if (h?.started_at) {
          setStartedAt(h.started_at);
        }
      } catch {
        if (!cancelled) {
          setSystemStatus("down");
        }
      }
    };
    pull();
    const id = window.setInterval(pull, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode]);

  // -------- Timer local: atualiza runtime_ms a cada 1s, se temos started_at --------
  useEffect(() => {
    if (mode !== "live") return;
    if (!startedAt) {
      setRuntimeMs(undefined);
      return;
    }
    const startedMs = Date.parse(startedAt);
    if (!Number.isFinite(startedMs)) {
      setRuntimeMs(undefined);
      return;
    }
    const update = () => setRuntimeMs(Date.now() - startedMs);
    update();
    const id = window.setInterval(update, 1000);
    return () => clearInterval(id);
  }, [mode, startedAt]);

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
      system: {
        status: systemStatus,
        ts: Date.now(),
        components: systemComponents,
        started_at: startedAt,
        runtime_ms: runtimeMs,
      },
      actuators,
      mpu,
      ...(selectedActuator ? { selectedActuator } : {}),
    };
    setSnapshot(snap);
  }, [mode, systemStatus, systemComponents, actuators, mpu, selectedActuator, startedAt, runtimeMs]);

  return (
    <LiveContext.Provider
      value={{
        snapshot,
        mode,
        setMode,
        setSelectedActuator,
      }}
    >
      {children}
    </LiveContext.Provider>
  );
}
