// src/components/dashboard/StatusOverview.tsx
import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import KpiCard, { type Severity } from "./KpiCard";
import { useLive } from "@/context/LiveContext";
import SystemStatusPanel from "@/components/monitoring/SystemStatusPanel";
import { rules, type SystemStatus } from "@/config/healthRules";
import RuntimeTicker from "@/components/dashboard/RuntimeTicker";

type EstadoStr = "ABERTO" | "FECHADO" | "ERRO" | "DESCONHECIDO" | "...";

function estadoFromFacets(facets?: { S1?: 0 | 1; S2?: 0 | 1 } | null): EstadoStr {
  if (!facets) return "DESCONHECIDO";
  const s1 = facets.S1 ?? null; // Recuado
  const s2 = facets.S2 ?? null; // Avançado
  if (s1 === 1 && s2 === 0) return "FECHADO";
  if (s2 === 1 && s1 === 0) return "ABERTO";
  if (s1 === 1 && s2 === 1) return "ERRO";
  return "DESCONHECIDO";
}

function estadoSeverity(estado: EstadoStr): Severity {
  if (estado === "ABERTO" || estado === "FECHADO") return "green";
  if (estado === "ERRO") return "red";
  return "gray";
}

function cyclesSeverity(cycles: number): Severity {
  // Reaproveita limiares de cpm nas regras enquanto não definimos outros
  if (cycles >= rules.cpm.greenMin) return "green";
  if (cycles >= rules.cpm.amberMin) return "amber";
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

  // -------- Sistema --------
  const statusSistema: SystemStatus = useMemo(() => {
    const raw = (snapshot?.system?.status ?? "unknown").toString().toLowerCase();
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

  // -------- Atuadores --------
  const selected: 1 | 2 | null = (() => {
    const sel = (snapshot as any)?.selectedActuator;
    return sel === 1 || sel === 2 ? (sel as 1 | 2) : null;
  })();

  const a1 = useMemo(() => snapshot?.actuators?.find((a) => a.id === 1) ?? null, [snapshot]);
  const a2 = useMemo(() => snapshot?.actuators?.find((a) => a.id === 2) ?? null, [snapshot]);

  const list = useMemo(() => {
    const base = [
      { id: 1 as 1 | 2, row: a1 },
      { id: 2 as 1 | 2, row: a2 },
    ];
    return selected ? base.filter((x) => x.id === selected) : base;
  }, [a1, a2, selected]);

  return (
    <div className="space-y-8">
      {/* KPIs topo — Sistema + Atuadores (filtrados se houver seleção) */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="STATUS DO SISTEMA" value={statusSistemaText} severity={sevSistema} />

        {/* Novo KPI: Runtime com ticker no cliente (continua subindo mesmo sem novos heartbeats) */}
        <KpiCard
          title="RUNTIME"
          value={<span className="font-mono"><RuntimeTicker fast /></span>}
          severity="gray"
        />

        {list.map(({ id, row }) => {
          const estado = estadoFromFacets(row?.facets) as EstadoStr;
          const sevEstado = estadoSeverity(estado);
          const cycles = Number((row as any)?.cycles ?? (row as any)?.totalCycles ?? row?.cpm ?? 0);
          const sevCycles = cyclesSeverity(cycles);
          const tempo = sinceTs((row as any)?.ts);

          return (
            <React.Fragment key={id}>
              <KpiCard title={`ESTADO ATUAL (A${id})`} value={estado} severity={sevEstado} />
              <KpiCard title={`CICLOS (A${id})`} value={cycles} unit="ciclos" severity={sevCycles} decimals={0} />
              <KpiCard title={`ÚLTIMO EVENTO (A${id})`} value={tempo} severity="gray" />
            </React.Fragment>
          );
        })}

        {/* Espaço reservado quando grade precisar completar (mantido) */}
        <Card className="h-full w-full min-w-0 p-4 hidden xl:block" />
      </div>

      {/* Painel detalhado de componentes do sistema (backend) */}
      <SystemStatusPanel />
    </div>
  );
}
