// src/components/monitoring/SystemStatusPanel.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLive } from "@/context/LiveContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import {
  openMonitoringWS,
  openLiveWS,
  type AnyWSMessage,
} from "@/lib/api";

type Sev = "operational" | "down" | "unknown";

/* ================= UI helpers ================= */
function pill(sev: Sev) {
  const base =
    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xl font-extrabold tracking-wide";
  switch (sev) {
    case "operational":
      return {
        cls: `${base} bg-emerald-900/30 text-emerald-300 ring-1 ring-emerald-500/30`,
        icon: <CheckCircle2 className="h-5 w-5" />,
        label: "Online",
      };
    case "down":
      return {
        cls: `${base} bg-red-900/30 text-red-300 ring-1 ring-red-500/30`,
        icon: <XCircle className="h-5 w-5" />,
        label: "Offline",
      };
    default:
      return {
        cls: `${base} bg-zinc-800 text-zinc-200 ring-1 ring-zinc-600/40`,
        icon: <HelpCircle className="h-5 w-5" />,
        label: "Unknown",
      };
  }
}

/* ================= Janela/tempo ================= */
const TX_TIMEOUT_MS = 3_000;         // transmission: janela p/ considerar Online
const ACT_CHANGE_WINDOW_MS = 60_000; // actuators: precisa ter HAVIDO troca de estado nessa janela
const LATCH_MS = 15_000;             // sensors: mantém Online por 15s após última vibração válida

/* ================= Util ================= */
function hasNumericVibration(items: any): boolean {
  const arr =
    (items?.vibration?.items as any[]) ??
    (Array.isArray(items) ? items : []) ??
    [];
  return (
    Array.isArray(arr) &&
    arr.some((it: any) => Number.isFinite(Number(it?.overall ?? it?.rms)))
  );
}

async function fetchJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

const SystemStatusPanel: React.FC = () => {
  const { snapshot } = useLive();

  // ===== timestamps =====
  const [now, setNow] = useState<number>(() => Date.now());
  const lastTransmissionAt = useRef<number>(0);
  const lastActuatorChangeAt = useRef<number>(0);
  const [lastVibAt, setLastVibAt] = useState<number | null>(null);

  // memória dos últimos estados para detectar TROCA
  const prevA1 = useRef<"RECUADO" | "AVANÇADO" | "DESCONHECIDO" | null>(null);
  const prevA2 = useRef<"RECUADO" | "AVANÇADO" | "DESCONHECIDO" | null>(null);

  // clock para reavaliar flags
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // ===== WS: qualquer mensagem válida conta como TRANSMISSION =====
  useEffect(() => {
    const l = openLiveWS({
      onOpen: () => (lastTransmissionAt.current = Date.now()),
      onMessage: (m: AnyWSMessage) => {
        lastTransmissionAt.current = Date.now();

        // detectar troca de estado dos atuadores (apenas quando vier pacote "live" com estados)
        if ((m as any)?.type === "live") {
          const arr: any[] = Array.isArray((m as any)?.actuators)
            ? (m as any).actuators
            : [];
          let changed = false;
          for (const it of arr) {
            const id = Number((it as any)?.id);
            const st = String((it as any)?.state ?? "").toUpperCase() as
              | "RECUADO"
              | "AVANÇADO"
              | "DESCONHECIDO";
            if (id === 1) {
              if (prevA1.current != null && st && st !== prevA1.current)
                changed = true;
              prevA1.current = st || prevA1.current;
            } else if (id === 2) {
              if (prevA2.current != null && st && st !== prevA2.current)
                changed = true;
              prevA2.current = st || prevA2.current;
            }
          }
          if (changed) lastActuatorChangeAt.current = Date.now();
        }
      },
    });

    const m = openMonitoringWS({
      onOpen: () => (lastTransmissionAt.current = Date.now()),
      onMessage: (msg: AnyWSMessage) => {
        lastTransmissionAt.current = Date.now();
        // vibração válida aciona latch de sensores
        if ((msg as any)?.type === "monitoring") {
          const items = (msg as any)?.vibration?.items ?? [];
          if (
            Array.isArray(items) &&
            items.some((it) =>
              Number.isFinite(Number(it?.overall ?? it?.rms))
            )
          ) {
            setLastVibAt(Date.now());
          }
        }
      },
    });

    return () => {
      try {
        l.close?.();
      } catch {}
      try {
        m.close?.();
      } catch {}
    };
  }, []);

  // ===== fallback HTTP para sensores (snapshot monitoring) =====
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const data = await fetchJson("/api/monitoring/snapshot");
        if (hasNumericVibration(data)) setLastVibAt(Date.now());
        // qualquer resposta válida também conta como transmissão
        lastTransmissionAt.current = Date.now();
      } catch {
        /* ignore */
      }
      if (!stop) setTimeout(tick, 4000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, []);

  // ===== cálculo das 3 tags =====
  const transmissionSev: Sev =
    now - lastTransmissionAt.current <= TX_TIMEOUT_MS
      ? "operational"
      : "down";

  // sensores: snapshot live pode ter mpu (rms/overall)
  const hasSnapshotMpu = useMemo(() => {
    const arr = (snapshot as any)?.mpu || [];
    return (
      Array.isArray(arr) &&
      arr.some((m: any) => Number.isFinite(Number(m?.rms ?? m?.overall)))
    );
  }, [snapshot]);

  const sensorsSev: Sev =
    (lastVibAt != null && now - lastVibAt < LATCH_MS) || hasSnapshotMpu
      ? "operational"
      : "down";

  // actuators: precisa ter havido TROCA de estado na janela
  const actuatorsSev: Sev =
    now - lastActuatorChangeAt.current <= ACT_CHANGE_WINDOW_MS
      ? "operational"
      : "down";

  // overall = todos “operational”
  const overall: Sev =
    transmissionSev === "operational" &&
    sensorsSev === "operational" &&
    actuatorsSev === "operational"
      ? "operational"
      : "down";

  /* ================= Render ================= */
  const Row = ({ label, sev }: { label: string; sev: Sev }) => {
    const p = pill(sev);
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="text-base md:text-lg text-zinc-300 font-semibold tracking-wide">
          {label}
        </div>
        <span className={p.cls}>
          {p.icon}
          {p.label}
        </span>
      </div>
    );
  };

  const overallPill = pill(overall);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>System Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="text-base md:text-lg font-semibold text-zinc-200 tracking-wide">
            Overall Status
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center">
            <div />
            <span className={overallPill.cls}>
              {overallPill.icon}
              {overallPill.label}
            </span>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <div className="text-base md:text-lg font-semibold text-zinc-200 tracking-wide">
            Components
          </div>
          <div className="space-y-4">
            <Row label="Actuators" sev={actuatorsSev} />
            <Row label="Sensors" sev={sensorsSev} />
            <Row label="Transmission" sev={transmissionSev} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SystemStatusPanel;
