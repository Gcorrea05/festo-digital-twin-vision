import React, { useEffect, useMemo, useState } from "react";
import { useLive } from "@/context/LiveContext";

let useActuatorSelection: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useActuatorSelection = require("@/context/ActuatorSelectionContext").useActuatorSelection;
} catch {
  useActuatorSelection = undefined;
}

import {
  getRuntime,
  getActuatorTimings,
  getVibration,
  ActuatorTimings,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { selectedId?: 1 | 2 };

function fmtSeconds(s?: number | null) {
  if (s == null) return "—";
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}m ${r}s`;
}

function Kpi({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="text-2xl font-semibold">{value}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LiveMetricsMon({ selectedId: selectedIdProp }: Props) {
  const { snapshot } = useLive();
  const ctxSel = useActuatorSelection?.();
  const selectedId: 1 | 2 = selectedIdProp ?? (ctxSel?.selected as 1 | 2) ?? 1;

  // ✅ CPM (1 min) exatamente como no Dashboard: via snapshot do WS (/api/ws/snapshot)
  const cpm1m =
    typeof (snapshot as any)?.cycles?.cpm === "number"
      ? ((snapshot as any).cycles.cpm as number)
      : null;

  // ---------- Runtime + Timings (poll fixo a cada 2s) ----------
  const [runtime, setRuntime] = useState<{
    runtime_seconds: number;
    since: string | null;
  } | null>(null);
  const [timings, setTimings] = useState<ActuatorTimings[] | null>(null);

  useEffect(() => {
    let alive = true;

    const tickFixed = async () => {
      try {
        const [rt, tms] = await Promise.all([getRuntime(), getActuatorTimings()]);
        if (!alive) return;
        setRuntime(rt);
        setTimings(tms.actuators);
      } catch {
        /* noop */
      }
    };

    tickFixed();
    const idFixed = setInterval(tickFixed, 2000);

    return () => {
      alive = false;
      clearInterval(idFixed);
    };
  }, []);

  const selectedTiming = useMemo(() => {
    const row = timings?.find((t) => t.actuator_id === selectedId)?.last;
    return {
      abre: row?.dt_abre_s ?? null,
      fecha: row?.dt_fecha_s ?? null,
      ciclo: row?.dt_ciclo_s ?? null,
      ts: row?.ts_utc ?? null,
    };
  }, [timings, selectedId]);

  // ---------- Vibration (poll do endpoint + fallback snapshot) ----------
  type VibItem = { mpu_id: number; overall?: number };
  const [vibItems, setVibItems] = useState<VibItem[] | null>(null);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const data = await getVibration(2); // janela curta para "live"
        if (!alive) return;
        setVibItems((data?.items ?? []).map((i: any) => ({ mpu_id: Number(i.mpu_id), overall: i.overall })));
      } catch {
        // noop — manteremos o fallback via snapshot
      }
    };

    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Mapeamento simples A1→MPU1, A2→MPU2
  const selectedMpuId = selectedId;

  const vibOverall = useMemo(() => {
    // 1) tenta via endpoint
    const byEndpoint = vibItems?.find((x) => Number(x.mpu_id) === Number(selectedMpuId));
    if (byEndpoint && typeof byEndpoint.overall === "number") return byEndpoint.overall;

    // 2) fallback: snapshot
    const items = snapshot?.vibration?.items as Array<{ overall: number; mpu_id: number }> | undefined;
    if (!items?.length) return null;
    const bySnapshot = items.find((x) => Number(x.mpu_id) === Number(selectedMpuId));
    return typeof bySnapshot?.overall === "number" ? bySnapshot.overall : null;
  }, [vibItems, snapshot?.vibration, selectedMpuId]);

  return (
    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
      {/* CPM 1 min - igual ao Dashboard; subtitle indica atuador selecionado */}
      <Kpi
        title="CPM (1 min)"
        value={cpm1m != null ? cpm1m.toFixed(1) : "—"}
        subtitle={`atuador A${selectedId}`}
      />

      {/* Sistema Ligado (runtime do sistema) */}
      <Kpi
        title="Sistema Ligado"
        value={fmtSeconds(runtime?.runtime_seconds ?? null)}
        subtitle={
          runtime?.since
            ? `desde ${new Date(runtime.since).toLocaleString()}`
            : "sem registro de INICIA"
        }
      />

      {/* Vibration overall (por atuador selecionado, via endpoint com fallback) */}
      <Kpi
        title="Vibration (overall)"
        value={vibOverall != null ? vibOverall.toFixed(2) : "—"}
        subtitle={`MPU ${selectedMpuId}`}
      />

      {/* Timings do atuador selecionado */}
      <Kpi
        title="DTabre (últ.)"
        value={fmtSeconds(selectedTiming.abre)}
        subtitle={
          selectedTiming.ts
            ? `ts ${new Date(selectedTiming.ts).toLocaleTimeString()}`
            : undefined
        }
      />
      <Kpi title="DTfecha (últ.)" value={fmtSeconds(selectedTiming.fecha)} />
      <Kpi title="DTciclo (últ.)" value={fmtSeconds(selectedTiming.ciclo)} />
    </div>
  );
}
