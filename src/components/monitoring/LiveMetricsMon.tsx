// src/components/monitoring/LiveMetricsMon.tsx  (1/2)
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getHealth, getMpuLatest, getActuatorCpmFromHistory } from "@/lib/api";

type Props = { selectedId: 1 | 2 };

const POLL_MS = 3000;

const LiveMetricsMon: React.FC<Props> = ({ selectedId }) => {
  const [system, setSystem] = useState<string>("—");
  const [cpm, setCpm] = useState<number | null>(null);
  const [mpu, setMpu] = useState<{ ax?: number; ay?: number; az?: number } | null>(null);

  // tempos “últimos” — ainda sem endpoint específico
  const [tOpenMs] = useState<number | null>(null);
  const [tCloseMs] = useState<number | null>(null);
  const [tCycleMs] = useState<number | null>(null);

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
      // health
      const h = await getHealth();
      if (alive) setSystem(h?.status === "ok" ? "OK" : h?.status?.toUpperCase() || "—");

      // cpm (60s via histórico do S2)
      const c = await getActuatorCpmFromHistory(selectedId, 60);
      if (alive) setCpm(c ?? null);

      // mpu latest (id = "MPUA1"/"MPUA2")
      const mid = selectedId === 1 ? "MPUA1" : "MPUA2";
      const m = await getMpuLatest(mid);
      if (alive) {
        setMpu(
          m ? { ax: m.ax_g ?? undefined, ay: m.ay_g ?? undefined, az: m.az_g ?? undefined } : null
        );
      }
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [selectedId]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {/* CPM (1 min) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">CPM (1 min)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {cpm ?? "—"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">atuador A{selectedId}</p>
        </CardContent>
      </Card>

      {/* Sistema Ligado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sistema Ligado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {system}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {system === "—" ? "sem registro de INICIA" : ""}
          </p>
        </CardContent>
      </Card>

      {/* Vibration (overall) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vibration (overall)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {vibOverall != null ? vibOverall.toFixed(2) : "—"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">MPU {selectedId}</p>
        </CardContent>
      </Card>

      {/* DTabre (últ.) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">DTabre (últ.)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {tOpenMs != null ? `${tOpenMs} ms` : "—"}
          </div>
        </CardContent>
      </Card>

      {/* DTfecha (últ.) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">DTfecha (últ.)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {tCloseMs != null ? `${tCloseMs} ms` : "—"}
          </div>
        </CardContent>
      </Card>

      {/* DTciclo (últ.) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">DTciclo (últ.)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {tCycleMs != null ? `${tCycleMs} ms` : "—"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveMetricsMon;
