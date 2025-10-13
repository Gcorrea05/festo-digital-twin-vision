// src/components/monitoring/LiveMetricsMon.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";
import {
  openMonitoringWS,
  openSlowWS,
  type WSMessageMonitoring,
  type WSMessageCPM,
  type AnyWSMessage,
} from "@/lib/api";

type Props = { selectedId: 1 | 2 };

// ------------------- helpers defensivos -------------------
function n(x: any): number | null {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}
function msFromEitherSecondsOrMs(secField?: any, msField?: any): number | null {
  const ms = n(msField);
  if (ms != null) return Math.round(ms);
  const sec = n(secField);
  return sec != null ? Math.round(sec * 1000) : null;
}
function pickFirst<T = any>(...vals: any[]): T | null {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v as T;
  }
  return null;
}
// ----------------------------------------------------------

const LiveMetricsMon: React.FC<Props> = ({ selectedId }) => {
  const { snapshot } = useLive();

  // --- System status (sem alterações) ---
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "—">(() => {
    const s = String(snapshot?.system?.status ?? "—").toLowerCase();
    if (s === "ok") return "OK";
    if (s === "degraded") return "DEGRADED";
    if (s === "down" || s === "offline") return "OFFLINE";
    return "—";
  }, [snapshot?.system?.status]);

  // --- Estados exibidos ---
  const [cpm, setCpm] = useState<number | null>(null);
  const [vibOverall, setVibOverall] = useState<number | null>(null);
  const [tOpenMs, setTOpenMs] = useState<number | null>(null);
  const [tCloseMs, setTCloseMs] = useState<number | null>(null);
  const [tCycleMs, setTCycleMs] = useState<number | null>(null);

  // Guard para evitar setState após unmount
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => void (aliveRef.current = false);
  }, []);

  // --- /ws/monitoring: timings + vibração ---
  useEffect(() => {
    const handleMonitoring = (msg: WSMessageMonitoring) => {
      // ======= Timings por atuador =======
      const timingsArr =
        (Array.isArray((msg as any).timings) && (msg as any).timings) ||
        (Array.isArray((msg as any).actuators) && (msg as any).actuators) ||
        [];

      const act = (timingsArr as any[]).find((a) => {
        const aid = n(a?.actuator_id) ?? n(a?.id);
        return aid === selectedId;
      });

      const last = act?.last ?? act?.latest ?? act;

      // aceita *_s ou *_ms, e sinônimos
      const openMs = msFromEitherSecondsOrMs(
        pickFirst(last?.dt_abre_s, last?.dtOpen_s, last?.open_s),
        pickFirst(last?.dt_abre_ms, last?.dtOpen_ms, last?.open_ms)
      );
      const closeMs = msFromEitherSecondsOrMs(
        pickFirst(last?.dt_fecha_s, last?.dtClose_s, last?.close_s),
        pickFirst(last?.dt_fecha_ms, last?.dtClose_ms, last?.close_ms)
      );
      const cycleMs = pickFirst(
        msFromEitherSecondsOrMs(
          pickFirst(last?.dt_ciclo_s, last?.dtCycle_s, last?.cycle_s),
          pickFirst(last?.dt_ciclo_ms, last?.dtCycle_ms, last?.cycle_ms)
        ),
        openMs != null && closeMs != null ? openMs + closeMs : null
      );

      // ======= Vibração overall por MPU =======
      // coleções possíveis: items | overall_by_mpu | by_mpu | list
      const vSrc =
        (Array.isArray((msg as any)?.vibration?.items) && (msg as any).vibration.items) ||
        (Array.isArray((msg as any)?.vibration?.overall_by_mpu) &&
          (msg as any).vibration.overall_by_mpu) ||
        (Array.isArray((msg as any)?.vibration?.by_mpu) && (msg as any).vibration.by_mpu) ||
        (Array.isArray((msg as any)?.vibration?.list) && (msg as any).vibration.list) ||
        [];
      const targetMpu = selectedId === 1 ? 1 : 2;

      const vibItem = (vSrc as any[]).find((it) => {
        const mid = n(it?.mpu_id) ?? n(it?.id);
        return mid === targetMpu;
      });

      const overall = pickFirst(
        n(vibItem?.overall),
        n(vibItem?.overall_rms),
        n(vibItem?.v_overall),
        n(vibItem?.rms),
        n(vibItem?.value)
      );

      if (!aliveRef.current) return;
      setTOpenMs(openMs);
      setTCloseMs(closeMs);
      setTCycleMs(cycleMs);
      setVibOverall(overall);
    };

    const wsMon = openMonitoringWS({
      onMessage: (m: AnyWSMessage) => {
        if (m.type === "monitoring") handleMonitoring(m as WSMessageMonitoring);
      },
    });

    return () => {
      wsMon.close();
    };
  }, [selectedId]);

  // --- /ws/slow: CPM por atuador ---
  useEffect(() => {
    const handleCpm = (msg: WSMessageCPM) => {
      const arr =
        (Array.isArray((msg as any).items) && (msg as any).items) ||
        (Array.isArray((msg as any).actuators) && (msg as any).actuators) ||
        (Array.isArray((msg as any).cpm) && (msg as any).cpm) ||
        [];

      const item = (arr as any[]).find((a) => {
        const aid = n(a?.id) ?? n(a?.actuator_id);
        return aid === selectedId;
      });

      const v = pickFirst(n(item?.cpm), n(item?.cpm_1min), n(item?.cpm_60s));
      if (!aliveRef.current) return;
      setCpm(v);
    };

    const wsSlow = openSlowWS({
      onMessage: (m: AnyWSMessage) => {
        if (m.type === "cpm") handleCpm(m as WSMessageCPM);
      },
    });

    return () => {
      wsSlow.close();
    };
  }, [selectedId]);
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

      {/* DTCiclo = aberto + fechado (ou valor do back) */}
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

export default React.memo(LiveMetricsMon);
