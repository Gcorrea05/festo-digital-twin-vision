// src/components/monitoring/LiveMetricsMon.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";
import {
  fetchJson,
  getMpuLatestSafe,
  getActuatorTimings,
  type ActuatorTimingsResp,
} from "@/lib/api";

const POLL_MS = 500;

type Props = { selectedId: 1 | 2 };
type MpuVec = { ax?: number; ay?: number; az?: number } | null;

// shape do /api/live/actuators/cpm
type ActuatorsCpmResp = {
  ts: string;
  actuators: { id: number; window_s: number; cycles: number; cpm: number }[];
};

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

  // --- CPM (via backend /api/live/actuators/cpm) ---
  const [cpmData, setCpmData] = useState<ActuatorsCpmResp | null>(null);
  const cpm = useMemo<number | null>(() => {
    const item = cpmData?.actuators?.find((a) => Number(a.id) === selectedId);
    const v = item ? Number(item.cpm) : null;
    return Number.isFinite(v as number) ? (v as number) : null;
  }, [cpmData, selectedId]);

  // --- VIBRAÇÃO (última amostra gravada no DB) ---
  const mpuName = selectedId === 1 ? "MPUA1" : "MPUA2";
  const [mpu, setMpu] = useState<MpuVec>(null);
  const vibOverall = useMemo(() => {
    if (!mpu) return null;
    const ax = Number(mpu.ax ?? 0),
      ay = Number(mpu.ay ?? 0),
      az = Number(mpu.az ?? 0);
    const v = Math.sqrt(ax * ax + ay * ay + az * az);
    return Number.isFinite(v) ? v : null;
  }, [mpu]);

  // --- TIMINGS (DTAbre/DTFecha/DTCiclo) vindos do backend ---
  const [timings, setTimings] = useState<ActuatorTimingsResp["actuators"] | null>(null);
  const secToMs = (val: number | null | undefined) =>
    val == null ? null : Number.isFinite(Number(val)) ? Math.round(Number(val) * 1000) : null;

  const { tOpenMs, tCloseMs, tCycleMs } = useMemo(() => {
    const act = timings?.find((a) => Number(a.actuator_id) === selectedId);
    const openMs = secToMs(act?.last?.dt_abre_s);
    const closeMs = secToMs(act?.last?.dt_fecha_s);
    const cycleBackend = secToMs(act?.last?.dt_ciclo_s);
    const cycleMs = cycleBackend ?? (openMs != null && closeMs != null ? openMs + closeMs : null);
    return { tOpenMs: openMs, tCloseMs: closeMs, tCycleMs: cycleMs };
  }, [timings, selectedId]);

  // Poll (mpu latest + timings + cpm)
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [latest, t, c] = await Promise.allSettled([
          getMpuLatestSafe(mpuName),
          getActuatorTimings(),
          fetchJson<ActuatorsCpmResp>(`/api/live/actuators/cpm?window_s=60`),
        ]);
        if (!alive) return;

        if (latest.status === "fulfilled" && latest.value) {
          setMpu({ ax: latest.value.ax, ay: latest.value.ay, az: latest.value.az });
        } else {
          setMpu(null);
        }

        if (t.status === "fulfilled" && Array.isArray(t.value?.actuators)) {
          setTimings(t.value.actuactors as any ?? t.value.actuators);
          setTimings(t.value.actuators);
        } else {
          setTimings(null);
        }

        if (c.status === "fulfilled") setCpmData(c.value);
        else setCpmData(null);
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
        </CardContent>
      </Card>

      {/* Sistema Ligado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sistema Ligado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">{systemText}</div>
        </CardContent>
      </Card>

      {/* Vibração (overall) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vibration (overall)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold leading-none tracking-tight">
            {vibOverall != null ? vibOverall.toFixed(2) : "—"}
          </div>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveMetricsMon;
