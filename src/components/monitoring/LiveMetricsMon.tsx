import React, { useEffect, useMemo, useState } from "react";
import { useLive } from "@/context/LiveContext";
let useActuatorSelection: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useActuatorSelection = require("@/context/ActuatorSelectionContext").useActuatorSelection;
} catch {
  useActuatorSelection = undefined;
}

import { getRuntime, getActuatorTimings, ActuatorTimings, getCpmByActuator } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { selectedId?: 1 | 2 };

function fmtSeconds(s?: number | null) {
  if (s == null) return "—";
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}m ${r}s`;
}

function Kpi({ title, value, subtitle }: { title: string; value: React.ReactNode; subtitle?: string }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="text-2xl font-semibold">{value}</div>
        {subtitle && <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

export default function LiveMetricsMon({ selectedId: selectedIdProp }: Props) {
  const { snapshot } = useLive();
  const ctxSel = useActuatorSelection?.();
  const selectedId: 1 | 2 = selectedIdProp ?? (ctxSel?.selected as 1 | 2) ?? 1;

  // ✅ CPM por atuador (poll 2s)
  const [cpmAct, setCpmAct] = useState<number | null>(null);

  // Vibration por atuador (assumindo MPU1↔A1, MPU2↔A2)
  const vibOverall = useMemo(() => {
    const items = snapshot?.vibration?.items as Array<{ overall: number; mpu_id: number }> | undefined;
    if (!items?.length) return null;
    const perSelected = items.filter((i) => Number(i.mpu_id) === Number(selectedId));
    const arr = (perSelected.length ? perSelected : items).map((i) => Number(i.overall || 0));
    return arr.length ? Math.max(...arr) : null;
  }, [snapshot?.vibration, selectedId]);

  // Runtime + Timings (poll 2s)
  const [runtime, setRuntime] = useState<{ runtime_seconds: number; since: string | null } | null>(null);
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

  // CPM depende do atuador selecionado → refaz o poll ao trocar A1/A2
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await getCpmByActuator(selectedId, 60);
        if (!alive) return;
        setCpmAct(r.cpm);
      } catch {
        /* noop */
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [selectedId]);

  const selectedTiming = useMemo(() => {
    const row = timings?.find((t) => t.actuator_id === selectedId)?.last;
    return {
      abre: row?.dt_abre_s ?? null,
      fecha: row?.dt_fecha_s ?? null,
      ciclo: row?.dt_ciclo_s ?? null,
      ts: row?.ts_utc ?? null,
    };
  }, [timings, selectedId]);

  return (
    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Kpi title="CPM (1 min)" value={cpmAct != null ? Number(cpmAct).toFixed(1) : "—"} />
      <Kpi
        title="Runtime"
        value={fmtSeconds(runtime?.runtime_seconds ?? null)}
        subtitle={runtime?.since ? `desde ${new Date(runtime.since).toLocaleTimeString()}` : undefined}
      />
      <Kpi title="Vibration (overall)" value={vibOverall != null ? vibOverall.toFixed(2) : "—"} />
      <Kpi
        title="DTabre (últ.)"
        value={fmtSeconds(selectedTiming.abre)}
        subtitle={selectedTiming.ts ? `ts ${new Date(selectedTiming.ts).toLocaleTimeString()}` : undefined}
      />
      <Kpi title="DTfecha (últ.)" value={fmtSeconds(selectedTiming.fecha)} />
      <Kpi title="DTciclo (últ.)" value={fmtSeconds(selectedTiming.ciclo)} />
    </div>
  );
}
