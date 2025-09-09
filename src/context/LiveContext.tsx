// src/context/LiveContext.tsx
// Contexto global para snapshot live/playback
// - Usa WS /api/ws/snapshot quando disponível
// - Fallback em polling REST a cada 2s
// - Silencioso quando o backend estiver OFF (sem flood no console)

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import { openLiveWS, LiveMessage } from "../lib/ws";
import {
  getSystem,
  getActuatorStatus,
  getActuatorCPM,
  getLatestMPU,
  getMPURms,
} from "../lib/api";

type Snapshot = LiveMessage["data"];
export type LiveMode = "live" | "playback";

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

export function LiveProvider({ children }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<LiveMode>("live");

  const wsClient = useRef<ReturnType<typeof openLiveWS> | null>(null);
  const pollingTimer = useRef<number | null>(null);

  // --- WS setup ---
useEffect(() => {
  if (mode !== "live") return;
  const client = openLiveWS({
    onMessage: (msg) => { if (msg.type === "snapshot") setSnapshot(msg.data); },
  });

  return () => {
    // Em DEV, o StrictMode desmonta logo após montar → não feche aqui
    if (!import.meta.env.DEV) {
      client.close();
    }
  };
}, [mode]);

  // --- Polling fallback (silencioso quando backend off) ---
  useEffect(() => {
    if (mode !== "live") return;

    const poll = async () => {
      // checagem rápida: se /api/system falhar, aborta esse ciclo
      try {
        await getSystem();
      } catch {
        return;
      }
      try {
        const sys = await getSystem();
        const [a1, a2] = await Promise.all([
          getActuatorStatus(1),
          getActuatorStatus(2).catch(() => null as any), // tolera 1 atuador
        ]);
        const [cpm1, cpm2] = await Promise.all([
          getActuatorCPM(1),
          a2 ? getActuatorCPM(2) : Promise.resolve({ cpm: 0 }),
        ]);
        const [mpu1, rms1] = await Promise.all([
          getLatestMPU(1).catch(() => null as any),
          getMPURms(1).catch(() => ({ rms: 0 })),
        ]);

        setSnapshot({
          system: {
            mode: sys?.mode ?? "DESLIGADO",
            severity: sys?.severity ?? "red",
            reason: sys?.reason ?? "",
            ts: sys?.ts ?? Date.now(),
          },
          actuators: [
            a1 ? { ...a1, cpm: cpm1.cpm, rms: rms1.rms } : undefined,
            a2 ? { ...a2, cpm: cpm2.cpm, rms: 0 } : undefined,
          ].filter(Boolean) as any,
          mpu: mpu1 ?? undefined,
        });
      } catch {
        // silencioso
      }
    };

    // primeira batida + intervalos
    poll();
    pollingTimer.current = window.setInterval(poll, 2000);

    return () => {
      if (pollingTimer.current) {
        clearInterval(pollingTimer.current);
        pollingTimer.current = null;
      }
    };
  }, [mode]);

  return (
    <LiveContext.Provider value={{ snapshot, mode, setMode }}>
      {children}
    </LiveContext.Provider>
  );
}
