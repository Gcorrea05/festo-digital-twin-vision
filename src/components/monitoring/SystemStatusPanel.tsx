// src/components/monitoring/SystemStatusPanel.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLive } from "@/context/LiveContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { openMonitoringWS, type AnyWSMessage } from "@/lib/api";

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

/* ================= Freshness model ================= */
const OK_MS = 2000;
const DEG_MS = 10000;
function sevFromTs(ts?: string | null, nowMs = Date.now()): Sev {
  if (!ts) return "unknown";
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return "unknown";
  const age = nowMs - t;
  if (age <= OK_MS) return "operational";
  if (age <= DEG_MS) return "unknown";
  return "down";
}

/* ================= Sensors latch via vibration ================= */
const LATCH_MS = 15000; // mantém “Online” por 15s após última vibração válida

function hasNumericVibration(items: any): boolean {
  const arr =
    (items?.vibration?.items as any[]) ??
    (Array.isArray(items) ? items : []) ??
    [];
  return Array.isArray(arr) && arr.some((it: any) => Number.isFinite(Number(it?.overall ?? it?.rms)));
}

async function fetchJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

const SystemStatusPanel: React.FC = () => {
  const { snapshot } = useLive();
  const now = Date.now();

  // Overall/Actuators/Transmission como antes
  const overall = useMemo<Sev>(() => sevFromTs(snapshot?.ts, now), [snapshot?.ts, now]);

  const actuatorsSev: Sev = useMemo(() => {
    const hasData = (snapshot?.actuators || []).length > 0;
    if (!hasData) return "down";
    return sevFromTs(snapshot?.ts, now);
  }, [snapshot?.actuators, snapshot?.ts, now]);

  const transmissionSev: Sev = useMemo(
    () => sevFromTs(snapshot?.ts, now),
    [snapshot?.ts, now]
  );

  // 🔹 Latch de vibração observado via WS + fallback HTTP
  const [lastVibAt, setLastVibAt] = useState<number | null>(null);

  // WS /monitoring para detectar vibração válida
  useEffect(() => {
    const ws = openMonitoringWS({
      onMessage: (m: AnyWSMessage) => {
        if ((m as any)?.type !== "monitoring") return;
        const items = (m as any)?.vibration?.items ?? [];
        if (Array.isArray(items) && items.some((it) => Number.isFinite(Number(it?.overall ?? it?.rms)))) {
          setLastVibAt(Date.now());
        }
      },
    });
    return () => ws.close();
  }, []);

  // Fallback: snapshot de monitoring a cada 4s
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const data = await fetchJson("/api/monitoring/snapshot");
        if (hasNumericVibration(data)) setLastVibAt(Date.now());
      } catch {}
      if (!stop) setTimeout(tick, 4000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, []);

  // Também considere mpu no snapshot live (se existir)
  const hasSnapshotMpu = useMemo(() => {
    const arr = snapshot?.mpu || [];
    return Array.isArray(arr) && arr.some((m: any) => Number.isFinite(Number(m?.rms ?? m?.overall)));
  }, [snapshot?.mpu]);

  const sensorsSev: Sev = useMemo(() => {
    const freshLatch = lastVibAt != null && Date.now() - lastVibAt < LATCH_MS;
    return hasSnapshotMpu || freshLatch ? "operational" : "down";
  }, [hasSnapshotMpu, lastVibAt]);

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
          {/* “last:” removido conforme pedido */}
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
