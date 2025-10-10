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

const LiveMetricsMon: React.FC<Props> = ({ selectedId }) => {
  const { snapshot } = useLive();

  // --- System status (sem alterações) ---
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "—">(() => {
    const s = String(snapshot?.system?.status ?? "—").toLowerCase();
    if (s === "ok") return "OK";
    if (s === "degraded") return "DEGRADED";
    if (s === "down" || s === "offline") return "OFFLINE";
    return "—";
    // patch: depende só do status, não do snapshot inteiro
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
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Helper
  const secToMs = (val: number | null | undefined) =>
    val == null ? null : Number.isFinite(Number(val)) ? Math.round(Number(val) * 1000) : null;

  // --- Inscrição no /ws/monitoring (2 s): timings + vibração (overall) ---
  useEffect(() => {
    const handleMonitoring = (msg: WSMessageMonitoring) => {
      // timings
      const act = (msg.timings || []).find((a) => Number(a.actuator_id) === selectedId);
      const openMs = secToMs(act?.last?.dt_abre_s);
      const closeMs = secToMs(act?.last?.dt_fecha_s);
      const cycleBackend = secToMs(act?.last?.dt_ciclo_s);
      const cycleMs = cycleBackend ?? (openMs != null && closeMs != null ? openMs + closeMs : null);

      // vibração: overall por mpu_id (1 -> A1, 2 -> A2)
      const targetMpu = selectedId === 1 ? 1 : 2;
      const vibItem = (msg.vibration?.items || []).find((it) => Number(it.mpu_id) === targetMpu);
      const overall = vibItem?.overall != null ? Number(vibItem.overall) : null;

      if (!aliveRef.current) return;
      setTOpenMs(openMs);
      setTCloseMs(closeMs);
      setTCycleMs(cycleMs);
      setVibOverall(Number.isFinite(overall as number) ? (overall as number) : null);
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

  // --- Inscrição no /ws/slow (60 s): CPM por atuador ---
  useEffect(() => {
    const handleCpm = (msg: WSMessageCPM) => {
      const item = (msg.items || []).find((a) => Number(a.id) === selectedId);
      const v = item ? Number(item.cpm) : null;
      if (!aliveRef.current) return;
      setCpm(Number.isFinite(v as number) ? (v as number) : null);
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

// patch: evita renders desnecessários quando props/snapshot não mudam
export default React.memo(LiveMetricsMon);
