// src/components/monitoring/LiveMetricsMon.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";
import { getMpuLatestSafe, getActuatorTimings, ActuatorTimingsResp } from "@/lib/api";

const POLL_MS = 3000;

type Props = { selectedId: 1 | 2 };
type MpuVec = { ax?: number; ay?: number; az?: number } | null;

const LiveMetricsMon: React.FC<Props> = ({ selectedId }) => {
  const { snapshot } = useLive();

  // --- System status (sem alterações) ---
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "—">(() => {
    const s = String(snapshot?.system?.status ?? "—").toLowerCase();
    if (s === "ok") return "OK";
    if (s === "degraded") return "DEGRADED";
    if (s === "down" || s === "offline") return "OFFLINE";
    return "—";
  }, [snapshot]);

  // --- CPM (mesma heurística do dashboard via snapshot.actuators) ---
  const cpm = useMemo<number | null>(() => {
    const a = snapshot?.actuators?.find((x) => x.id === selectedId);
    const v = a ? Number(a.cpm ?? 0) : null;
    return Number.isFinite(v as number) ? (v as number) : null;
  }, [snapshot, selectedId]);

  // --- VIBRAÇÃO (última amostra gravada no DB) ---
  const mpuName = selectedId === 1 ? "MPUA1" : "MPUA2";
  const [mpu, setMpu] = useState<MpuVec>(null);

  const vibOverall = useMemo(() => {
    if (!mpu) return null;
    const ax = Number(mpu.ax ?? 0);
    const ay = Number(mpu.ay ?? 0);
    const az = Number(mpu.az ?? 0);
    const v = Math.sqrt(ax * ax + ay * ay + az * az);
    return Number.isFinite(v) ? v : null;
  }, [mpu]);

  // --- TIMINGS (DTAbre/DTFecha/DTCiclo) vindos do backend ---
  const [timings, setTimings] = useState<ActuatorTimingsResp["actuators"] | null>(null);

  function secToMs(val: number | null | undefined): number | null {
    if (val == null) return null;
    const ms = Math.round(Number(val) * 1000);
    return Number.isFinite(ms) ? ms : null;
  }

  const { tOpenMs, tCloseMs, tCycleMs } = useMemo(() => {
    const act = timings?.find((a) => Number(a.actuator_id) === selectedId);
    const openMs = secToMs(act?.last?.dt_abre_s ?? null);
    const closeMs = secToMs(act?.last?.dt_fecha_s ?? null);
    // Se o backend já calcular dt_ciclo_s, usamos; senão somamos localmente quando possível
    const cycleMsBackend = secToMs(act?.last?.dt_ciclo_s ?? null);
    const cycleMs =
      cycleMsBackend != null
        ? cycleMsBackend
        : openMs != null && closeMs != null
        ? openMs + closeMs
        : null;
    return { tOpenMs: openMs, tCloseMs: closeMs, tCycleMs: cycleMs };
  }, [timings, selectedId]);

  // Poll dos dados (mpu latest + timings)
  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        // vibração
        const latest = await getMpuLatestSafe(mpuName).catch(() => null);
        if (alive) setMpu(latest ? { ax: latest.ax, ay: latest.ay, az: latest.az } : null);

        // timings (DTAbre/DTFecha/DTCiclo)
        const t = await getActuatorTimings().catch(() => null);
        if (alive) setTimings(Array.isArray(t?.actuators) ? t!.actuators : null);
      } finally {
        if (alive) setTimeout(tick, POLL_MS);
      }
    };

    tick();
    return () => {
      alive = false;
    };
  }, [mpuName]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {/* CPM (1 min) — fixo para A{selectedId} */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">CPM (1 min)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {cpm != null ? cpm.toFixed(1) : "—"}
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
            {systemText}
          </div>
        </CardContent>
      </Card>

      {/* Vibração (último valor salvo no DB → overall) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vibration (overall)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {vibOverall != null ? vibOverall.toFixed(2) : "—"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{mpuName}</p>
        </CardContent>
      </Card>

      {/* DTAbre */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">DTAbre (últ.)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {tOpenMs != null ? `${tOpenMs} ms` : "—"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">tag: aberto</p>
        </CardContent>
      </Card>

      {/* DTFecha */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">DTFecha (últ.)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {tCloseMs != null ? `${tCloseMs} ms` : "—"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">tag: fechado</p>
        </CardContent>
      </Card>

      {/* DTCiclo = aberto + fechado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">DTCiclo (últ.)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {tCycleMs != null ? `${tCycleMs} ms` : "—"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">aberto + fechado</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveMetricsMon;