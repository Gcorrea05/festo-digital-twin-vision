// src/context/LiveContext.tsx
// Contexto global para snapshot live/playback
// - Polling REST a cada 2s (health, actuators, cpm, mpu)
// - WS OPC: /ws/opc?all=true para atualizar S1/S2 em tempo real

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { openOpcWS, WSClient } from "@/lib/ws";
import {
  getHealth,
  getLiveActuatorsState,
  getOPCHistory,
  getMpuIds,
  getLatestMPU,
  type MPUDataRaw,
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
};

export type Snapshot = {
  system: { status: "ok" | "down" | "unknown"; ts: number };
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
};

type LiveContextValue = {
  snapshot: Snapshot | null;
  mode: LiveMode;
  setMode: (m: LiveMode) => void;
};

const LiveContext = createContext<LiveContextValue | undefined>(undefined);

export function useLive(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be inside LiveProvider");
  return ctx;
}

type Props = { children: ReactNode };

// Conta subidas (0->1) de S2 nos últimos 60s para calcular CPM
async function getCpmLastMin(actuatorId: number): Promise<number> {
  try {
    const hist = await getOPCHistory({
      actuatorId,
      facet: "S2",
      since: "-60s",
      asc: true,
      limit: 2000,
    });
    let c = 0;
    for (let i = 1; i < hist.length; i++) {
      if (Number(hist[i - 1].value) === 0 && Number(hist[i].value) === 1) c++;
    }
    return c;
  } catch {
    return 0;
  }
}

// Normaliza um MPUDataRaw em shape consistente
function normalizeMpu(raw: MPUDataRaw | undefined): Snapshot["mpu"] {
  if (!raw) return null;
  return {
    ts: raw.ts_utc ?? raw.ts ?? new Date().toISOString(),
    id: raw.id,
    ax: raw.ax ?? raw.ax_g ?? 0,
    ay: raw.ay ?? raw.ay_g ?? 0,
    az: raw.az ?? raw.az_g ?? 0,
    gx: raw.gx ?? raw.gx_dps ?? 0,
    gy: raw.gy ?? raw.gy_dps ?? 0,
    gz: raw.gz ?? raw.gz_dps ?? 0,
    temp_c: raw.temp_c ?? 0,
  };
}

export function LiveProvider({ children }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<LiveMode>("live");

  const pollingTimer = useRef<number | null>(null);
  const wsRef = useRef<WSClient | null>(null);

  // ---- Polling: monta snapshot completo a cada 2s ----
  useEffect(() => {
    if (mode !== "live") return;

    const poll = async () => {
      try {
        const h = await getHealth().catch(() => null);
        if (!h || h.status !== "ok") return;

        const live = await getLiveActuatorsState().catch(() => ({
          actuators: [] as any[],
        }));
        const acts = (live.actuators || [])
          .map((a: any) => {
            const m = String(a.actuator_id || "").match(/(\d+)/);
            const id = m ? parseInt(m[1], 10) : 0;
            return {
              id,
              recuado: a.recuado as 0 | 1,
              avancado: a.avancado as 0 | 1,
              ts: a.ts as string,
              fsm: { state: a.state },
            };
          })
          .filter((a: any) => a.id > 0);

        // CPM por atuador
        const ids = acts.map((a) => a.id);
        const [cpm1, cpm2] = await Promise.all([
          ids.includes(1) ? getCpmLastMin(1) : Promise.resolve(0),
          ids.includes(2) ? getCpmLastMin(2) : Promise.resolve(0),
        ]);

        // MPU: pega o primeiro id disponível
        let mpu: Snapshot["mpu"] = null;
        try {
          const mpuIds = await getMpuIds();
          if (mpuIds && mpuIds.length) {
            const raw = await getLatestMPU(mpuIds[0]).catch(() => undefined);
            mpu = normalizeMpu(raw);
          }
        } catch {
          /* ignore */
        }

        const snap: Snapshot = {
          system: { status: "ok", ts: Date.now() },
          actuators: acts.map((a) => ({
            id: a.id,
            fsm: a.fsm,
            ts: a.ts,
            facets: { S1: a.recuado ?? 0, S2: a.avancado ?? 0 },
            cpm: a.id === 1 ? cpm1 : a.id === 2 ? cpm2 : 0,
            rms: 0,
          })),
          mpu,
        };
        setSnapshot(snap);
      } catch {
        // silencioso se backend off
      }
    };

    poll();
    pollingTimer.current = window.setInterval(
      poll,
      2000
    ) as unknown as number;

    return () => {
      if (pollingTimer.current) {
        clearInterval(pollingTimer.current);
        pollingTimer.current = null;
      }
    };
  }, [mode]);

  // ---- WS OPC: atualiza facets em tempo real ----
  useEffect(() => {
    if (mode !== "live") return;
    wsRef.current?.close();

    const client = openOpcWS({
      all: true,
      onMessage: (m) => {
        if (m?.type !== "opc_event" || !m?.name) return;
        const rec = /^Recuado_(\d+)S1$/i.exec(m.name);
        const ava = /^Avancado_(\d+)S2$/i.exec(m.name);
        if (!rec && !ava) return;

        const id = Number((rec?.[1] ?? ava?.[1]) || 0);
        if (!id) return;

        const isOne =
          typeof m.value_bool === "boolean"
            ? m.value_bool
              ? 1
              : 0
            : m.value_num
            ? 1
            : 0;

        setSnapshot((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            actuators: prev.actuators.map((a) => ({ ...a })),
          };
          const idx = next.actuators.findIndex((a) => a.id === id);
          if (idx < 0) return prev;

          const a = next.actuators[idx];
          const facets: Facets = { ...a.facets };
          if (rec) facets.S1 = isOne as 0 | 1;
          if (ava) facets.S2 = isOne as 0 | 1;
          next.actuators[idx] = {
            ...a,
            facets,
            ts: (m.ts_utc as string) ?? a.ts,
          };
          return next;
        });
      },
    });

    wsRef.current = client;
    return () => client.close();
  }, [mode]);

  return (
    <LiveContext.Provider value={{ snapshot, mode, setMode }}>
      {children}
    </LiveContext.Provider>
  );
}
