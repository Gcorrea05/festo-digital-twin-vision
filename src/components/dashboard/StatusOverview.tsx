// src/components/dashboard/StatusOverview.tsx
import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import KpiCard, { type Severity } from "./KpiCard";
import { useLive } from "@/context/LiveContext";
import SystemStatusPanel from "@/components/monitoring/SystemStatusPanel";
import { rules, type SystemStatus } from "@/config/healthRules";

type EstadoStr = "AVANÇADO" | "RECUADO" | "TRANSIÇÃO" | "DESCONHECIDO" | "...";

function estadoFromFacets(facets?: { S1?: 0 | 1; S2?: 0 | 1 } | null): EstadoStr {
  if (!facets) return "DESCONHECIDO";
  if (facets.S2 === 1 && facets.S1 !== 1) return "AVANÇADO";
  if (facets.S1 === 1 && facets.S2 !== 1) return "RECUADO";
  if (facets.S1 == null && facets.S2 == null) return "DESCONHECIDO";
  return "TRANSIÇÃO";
}

function estadoSeverity(estado: EstadoStr): Severity {
  if (estado === "AVANÇADO" || estado === "RECUADO") return "green";
  if (estado === "TRANSIÇÃO") return "amber";
  if (estado === "DESCONHECIDO") return "gray";
  return "gray";
}

function cpmSeverity(cpm: number): Severity {
  if (cpm >= rules.cpm.greenMin) return "green";
  if (cpm >= rules.cpm.amberMin) return "amber";
  return "red";
}

function sinceTs(ts?: string | null): string {
  if (!ts) return "--";
  const diff = Math.max(0, Date.now() - new Date(ts).getTime());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function StatusOverview() {
  const { snapshot } = useLive();

  // ---------------- Sistema ----------------
  const statusSistema: SystemStatus = useMemo(() => {
    const raw = (snapshot?.system?.status ?? "unknown").toString().toLowerCase();
    // aceitamos "ok" | "degraded" | "offline"; se backend usar "down", tratamos como "offline"
    if (raw === "ok" || raw === "degraded" || raw === "offline") return raw as SystemStatus;
    if (raw === "down") return "offline";
    return "unknown";
  }, [snapshot]);

  const statusSistemaText = useMemo(() => {
    if (statusSistema === "ok") return "Online";
    if (statusSistema === "degraded") return "Degraded";
    if (statusSistema === "offline") return "Offline";
    return "…";
  }, [statusSistema]);

  const sevSistema: Severity = rules.systemToSeverity(statusSistema) as Severity;

  // ---------------- Atuadores A1 / A2 ----------------
  const a1 = useMemo(() => snapshot?.actuators?.find((a) => a.id === 1) ?? null, [snapshot]);
  const a2 = useMemo(() => snapshot?.actuators?.find((a) => a.id === 2) ?? null, [snapshot]);

  const estadoA1 = useMemo<EstadoStr>(() => (snapshot ? estadoFromFacets(a1?.facets) : "..."), [snapshot, a1]);
  const estadoA2 = useMemo<EstadoStr>(() => (snapshot ? estadoFromFacets(a2?.facets) : "..."), [snapshot, a2]);

  const sevEstadoA1 = estadoSeverity(estadoA1);
  const sevEstadoA2 = estadoSeverity(estadoA2);

  const cpmA1 = Number.isFinite(Number(a1?.cpm)) ? Number(a1?.cpm) : 0;
  const cpmA2 = Number.isFinite(Number(a2?.cpm)) ? Number(a2?.cpm) : 0;

  const sevCpmA1 = cpmSeverity(cpmA1);
  const sevCpmA2 = cpmSeverity(cpmA2);

  const tempoA1 = sinceTs((a1 as any)?.ts);
  const tempoA2 = sinceTs((a2 as any)?.ts);

  return (
    <div className="space-y-8">
      {/* KPIs topo — sistema + A1 + A2 */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {/* Sistema */}
        <KpiCard title="STATUS DO SISTEMA" value={statusSistemaText} severity={sevSistema} />

        {/* A1 - Estado */}
        <KpiCard title="ESTADO ATUAL (A1)" value={estadoA1} severity={sevEstadoA1} />

        {/* A1 - CPM */}
        <KpiCard title="CPM (A1)" value={cpmA1} unit="ciclos/min" severity={sevCpmA1} decimals={0} />

        {/* A1 - Último evento */}
        <KpiCard title="ÚLTIMO EVENTO (A1)" value={tempoA1} severity="gray" />

        {/* A2 - Estado */}
        <KpiCard title="ESTADO ATUAL (A2)" value={estadoA2} severity={sevEstadoA2} />

        {/* A2 - CPM */}
        <KpiCard title="CPM (A2)" value={cpmA2} unit="ciclos/min" severity={sevCpmA2} decimals={0} />

        {/* A2 - Último evento */}
        <KpiCard title="ÚLTIMO EVENTO (A2)" value={tempoA2} severity="gray" />

        {/* Espaço reservado (ex.: OEE/meta futura) */}
        <Card className="h-full w-full min-w-0 p-4 hidden xl:block" />
      </div>

      {/* System Status detalhado (componentes) diretamente do backend */}
      <SystemStatusPanel />
    </div>
  );
}
