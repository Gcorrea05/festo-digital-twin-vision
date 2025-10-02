// src/context/LiveContext.tsx
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
  getMpuIds,
  getLatestMPU,
  getActuatorsStateFast,
} from "@/lib/api";

export type LiveMode = "live" | "playback";

type Facets = { S1: 0 | 1; S2: 0 | 1 };

export type ActuatorSnapshot = {
  id: number;
  ts: string;
  fsm: { state: string; error_code?: string | number };
  facets: Facets; // S1=Recuado, S2=Avançado (0/0 = transição)
  cpm: number;
  rms: number;
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
    started_at?: string;   // telemetria opcional
    runtime_ms?: number;   // runtime de sessão (calculado no front)
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
  if (v.includes("ok")) return "ok";
  if (v.includes("down") || v.includes("offline")) return "down";
  return "unknown";
}

// Regra sem transições: só aberto/fechado/indef/erro
function decideFsmState(f: { S1: 0 | 1; S2: 0 | 1 }): string {
  const s1 = f.S1, s2 = f.S2;
  if (s1 === 1 && s2 === 0) return "fechado"; // RECUADO
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
  const [startedAt, setStartedAt] = useState<string | undefined>(undefined); // opcional
  const [runtimeMs, setRuntimeMs] = useState<number | undefined>(undefined);

  const [actuators, setActuators] = useState<ActuatorSnapshot[]>([]);
  const [mpu, setMpu] = useState<Snapshot["mpu"]>(null);
  const mpuChosenIdRef = useRef<string | null>(null);

  // último estado estável por atuador (evita “piscadas” em 0/0)
  const lastStableRef = useRef<Record<number, "ABERTO" | "RECUADO" | undefined>>({});

  // controle anti-fila / anti-resposta atrasada
  const reqSeqActRef = useRef(0);
  const reqSeqMpuRef = useRef(0);
  const visibleRef = useRef<boolean>(typeof document !== "undefined" ? !document.hidden : true);

  // ===== Runtime de sessão guiado por TRANSIÇÃO ABERTO -> RECUADO =====
  const FRESH_GAP_MS = 3000; // pausa se 3s sem dados
  const TICK_MS = 500;       // atualização do relógio

  // instante da última chegada de dados (para "freshness")
  const lastActFreshMsRef = useRef<number | null>(null);
  // início da sessão atual
  const sessionStartMsRef = useRef<number | null>(null);
  // estado: relógio rodando?
  const runningRef = useRef<boolean>(false);
  // precisamos de um gatilho de transição ABERTO -> RECUADO para iniciar?
  const waitingForTriggerRef = useRef<boolean>(true);
  // seta quando detectar a transição no poll; o tick consome isso
  const wantStartRef = useRef<boolean>(false);

  // -------- Poll 0: observar visibilidade da aba (pausa/resume) --------
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => { visibleRef.current = !document.hidden; };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // -------- Poll 1: Actuators FAST PATH (500 ms) + anti-fila --------
  useEffect(() => {
    if (mode !== "live") return;
    let timer: number | null = null;
    let cancelled = false;

    const LOOP_MS = 500;

    const tick = async () => {
      try {
        if (!visibleRef.current) {
          timer = window.setTimeout(tick, 800) as unknown as number;
          return;
        }

        const mySeq = ++reqSeqActRef.current;
        const live = await getActuatorsStateFast();
        if (cancelled || mySeq !== reqSeqActRef.current) return;

        const tsNow = new Date().toISOString();

        const acts: ActuatorSnapshot[] = (live?.actuators ?? [])
          .map((a: any) => {
            const id = Number(a?.id ?? a?.actuator_id ?? 0);
            if (!id) return null;

            // 1) facets por texto do estado (RECUADO/AVANÇADO) ou legado
            const st = String(a?.state ?? "").toUpperCase();
            let facetsFromState: Facets | null = null;
            if (st.includes("RECU")) facetsFromState = { S1: 1, S2: 0 }; // RECUADO = FECHADO
            else if (st.includes("AVAN")) facetsFromState = { S1: 0, S2: 1 }; // ABERTO

            const to01 = (v: any) => (v === true || v === 1 ? 1 : v === false || v === 0 ? 0 : 0);
            const s1b = (a?.facets && a.facets.S1 != null) ? a.facets.S1 : a?.recuado ?? null;
            const s2b = (a?.facets && a.facets.S2 != null) ? a.facets.S2 : a?.avancado ?? null;
            const facets: Facets = facetsFromState ?? { S1: to01(s1b) as 0 | 1, S2: to01(s2b) as 0 | 1 };

            // ----- DETECÇÃO DE TRANSIÇÃO ABERTO -> RECUADO -----
            const prevStable = lastStableRef.current[id]; // "ABERTO" | "RECUADO" | undefined
            let newStable: "ABERTO" | "RECUADO" | undefined = prevStable;

            if (facets.S1 === 1 && facets.S2 === 0) newStable = "RECUADO";
            else if (facets.S1 === 0 && facets.S2 === 1) newStable = "ABERTO";
            else if (facets.S1 === 0 && facets.S2 === 0) newStable = prevStable; // mantém
            // 1/1 (erro) não altera estável

            // se houve transição ABERTO -> RECUADO e estamos esperando gatilho, marca para iniciar
            if (waitingForTriggerRef.current && prevStable === "ABERTO" && newStable === "RECUADO") {
              wantStartRef.current = true;
            }

            // atualiza último estável
            if (newStable) lastStableRef.current[id] = newStable;

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

        // chegada de dados (para freshness)
        if (acts.length > 0) {
          lastActFreshMsRef.current = Date.now();
        }

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
      } catch {
        if (!cancelled) setActuators([]);
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(tick, LOOP_MS) as unknown as number;
        }
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [mode]);

  // -------- Poll 1.1: Health (status) a cada 5s --------
  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;
    let timer: number | null = null;

    const pull = async () => {
      try {
        const h = await getHealth();
        if (cancelled) return;
        setSystemStatus(normSystemStatus(h?.status));
        if (h?.started_at) setStartedAt(String(h.started_at)); // só telemetria
      } catch {
        if (!cancelled) setSystemStatus("down");
      } finally {
        if (!cancelled) timer = window.setTimeout(pull, 5000) as unknown as number;
      }
    };
    pull();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [mode]);

  // -------- Runtime: só inicia após ABERTO -> RECUADO; pausa se 3s sem dado --------
  useEffect(() => {
    if (mode !== "live") return;

    let timer: number | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;

      const now = Date.now();
      const lastFresh = lastActFreshMsRef.current;
      const isFresh = lastFresh != null && now - lastFresh <= FRESH_GAP_MS;

      if (!isFresh) {
        // sem dados recentes: pausa e requisita novo gatilho
        runningRef.current = false;
        waitingForTriggerRef.current = true;
        // congela runtimeMs (não zera aqui)
      } else {
        // há dados chegando e estamos "frescos"
        if (!runningRef.current) {
          // ainda não estamos rodando: só inicia se tiver gatilho pendente
          if (waitingForTriggerRef.current && wantStartRef.current) {
            sessionStartMsRef.current = now;
            setRuntimeMs(0);
            runningRef.current = true;
            waitingForTriggerRef.current = false;
            wantStartRef.current = false; // consumiu o gatilho
          }
        } else {
          // rodando: atualiza contagem
          const start = sessionStartMsRef.current ?? now;
          setRuntimeMs(now - start);
        }
      }

      timer = window.setTimeout(tick, TICK_MS) as unknown as number;
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [mode]);

  // -------- Poll 2: MPU latest (1 s) + anti-fila --------
  useEffect(() => {
    if (mode !== "live") return;
    let timer: number | null = null;
    let cancelled = false;

    const LOOP_MS = 1000;

    const discoverAndTick = async () => {
      try {
        if (!visibleRef.current) {
          timer = window.setTimeout(discoverAndTick, 1200) as unknown as number;
          return;
        }

        if (!mpuChosenIdRef.current) {
          const ids = await getMpuIds().catch(() => []);
          if (ids && ids.length) mpuChosenIdRef.current = String(ids[0]);
        }
        if (mpuChosenIdRef.current) {
          const mySeq = ++reqSeqMpuRef.current;
          const raw = await getLatestMPU(mpuChosenIdRef.current as any).catch(() => null);
          if (cancelled || mySeq !== reqSeqMpuRef.current) return;

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
      } catch {
        if (!cancelled) setMpu(null);
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(discoverAndTick, LOOP_MS) as unknown as number;
        }
      }
    };

    discoverAndTick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [mode]);

  // -------- Composer: monta o Snapshot final --------
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
    <LiveContext.Provider value={{ snapshot, mode, setMode, setSelectedActuator }}>
      {children}
    </LiveContext.Provider>
  );
}
