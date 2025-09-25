// src/components/dashboard/LiveMetrics.tsx  (1/1)
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  getHealth,
  getOpcLatestByActuatorFacet,
  getMpuLatest,
  getActuatorCpmFromHistory,
} from "@/lib/api";

type ActRow = {
  id: 1 | 2;
  s1?: boolean | null;
  s2?: boolean | null;
  cpm?: number | null;
};

const POLL_MS = 3000;

const LiveMetrics: React.FC = () => {
  const [system, setSystem] = useState<"OK" | "OFFLINE" | "DEGRADED">("OFFLINE");
  const [acts, setActs] = useState<ActRow[]>([{ id: 1 }, { id: 2 }]);
  const [mpu, setMpu] = useState<{ ax?: number; ay?: number; az?: number } | null>(null);

  const totalCpm = useMemo(
    () => acts.reduce((acc, a) => acc + (Number(a.cpm) || 0), 0),
    [acts]
  );

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      // Health
      const h = await getHealth();
      if (alive) {
        setSystem(
          h?.status === "ok" ? "OK" : h?.status === "degraded" ? "DEGRADED" : "OFFLINE"
        );
      }

      // Atuadores: últimos S1/S2 + CPM (60s via histórico)
      const next: ActRow[] = [];
      for (const id of [1, 2] as const) {
        const [s1, s2, cpm] = await Promise.all([
          getOpcLatestByActuatorFacet(id, "S1"),
          getOpcLatestByActuatorFacet(id, "S2"),
          getActuatorCpmFromHistory(id, 60),
        ]);
        next.push({
          id,
          s1: s1?.value_bool ?? null,
          s2: s2?.value_bool ?? null,
          cpm: cpm ?? null,
        });
      }
      if (alive) setActs(next);

      // MPU: último do MPUA1
      const m1 = await getMpuLatest("MPUA1");
      if (alive) {
        setMpu(
          m1
            ? { ax: m1.ax_g ?? undefined, ay: m1.ay_g ?? undefined, az: m1.az_g ?? undefined }
            : null
        );
      }
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Metrics (último valor gravado)</CardTitle>
      </CardHeader>

      <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Status do sistema */}
        <div>
          <p className="text-sm text-muted-foreground">System</p>
          <p className="text-lg font-bold">{system}</p>
        </div>

        {/* CPM total */}
        <div>
          <p className="text-sm text-muted-foreground">Total CPM</p>
          <p className="text-lg font-bold">{totalCpm}</p>
        </div>

        {/* Atuadores */}
        <div className="sm:col-span-3">
          <p className="text-sm text-muted-foreground">Actuators</p>
          <ul className="text-sm space-y-1">
            {acts.map((a) => {
              const state = a.s2 ? "AVANÇADO" : "RECUADO"; // sem "transição"
              return (
                <li key={a.id}>
                  AT{a.id}: {state} — {a.cpm ?? "—"} CPM
                </li>
              );
            })}
          </ul>
        </div>

        {/* MPU opcional */}
        {mpu && (
          <div className="sm:col-span-3">
            <p className="text-sm text-muted-foreground">MPU</p>
            <p className="text-xs">
              ax: {mpu.ax?.toFixed(2)} | ay: {mpu.ay?.toFixed(2)} | az: {mpu.az?.toFixed(2)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LiveMetrics;
