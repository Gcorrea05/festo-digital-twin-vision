// src/components/monitoring/LiveMetricsMon.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";
import { getMpuLatest } from "@/lib/api";

const POLL_MS = 3000;

const LiveMetricsMon: React.FC = () => {
  const { snapshot } = useLive();
  const selectedId: 1 | 2 = (snapshot?.selectedActuator as 1 | 2) ?? 1; // default 1

  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "—">(() => {
    const s = String(snapshot?.system?.status ?? "—").toLowerCase();
    if (s === "ok") return "OK";
    if (s === "degraded") return "DEGRADED";
    if (s === "down" || s === "offline") return "OFFLINE";
    return "—";
  }, [snapshot]);

  const cpm = useMemo<number | null>(() => {
    const a = snapshot?.actuators?.find((x) => x.id === selectedId);
    return a ? Number(a.cpm ?? 0) : null;
  }, [snapshot, selectedId]);

  const [mpu, setMpu] = useState<{ ax?: number; ay?: number; az?: number } | null>(null);

  const vibOverall = useMemo(() => {
    if (!mpu) return null;
    const ax = Number(mpu.ax ?? 0);
    const ay = Number(mpu.ay ?? 0);
    const az = Number(mpu.az ?? 0);
    const v = Math.sqrt(ax * ax + ay * ay + az * az);
    return Number.isFinite(v) ? v : null;
  }, [mpu]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const mid = selectedId === 1 ? "MPUA1" : "MPUA2";
        const m = await getMpuLatest(mid).catch(() => null);
        if (alive) {
          setMpu(
            m
              ? {
                  ax: (m as any).ax_g ?? (m as any).ax ?? undefined,
                  ay: (m as any).ay_g ?? (m as any).ay ?? undefined,
                  az: (m as any).az_g ?? (m as any).az ?? undefined,
                }
              : null
          );
        }
      } finally {
        if (alive) setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const tOpenMs: number | null = null;
  const tCloseMs: number | null = null;
  const tCycleMs: number | null = null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">CPM (1 min)</CardTitle></CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {cpm ?? "—"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">atuador A{selectedId}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Sistema Ligado</CardTitle></CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">{systemText}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Vibration (overall)</CardTitle></CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {vibOverall != null ? vibOverall.toFixed(2) : "—"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">MPU {selectedId}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">DTabre (últ.)</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-semibold leading-none tracking-tight">{tOpenMs != null ? `${tOpenMs} ms` : "—"}</div></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">DTfecha (últ.)</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-semibold leading-none tracking-tight">{tCloseMs != null ? `${tCloseMs} ms` : "—"}</div></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">DTciclo (últ.)</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-semibold leading-none tracking-tight">{tCycleMs != null ? `${tCycleMs} ms` : "—"}</div></CardContent>
      </Card>
    </div>
  );
};

export default LiveMetricsMon;
