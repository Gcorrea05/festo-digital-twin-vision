// src/components/dashboard/StatusOverview.tsx
import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";
import SystemStatusPanel from "@/components/monitoring/SystemStatusPanel";
import { rules, type SystemStatus } from "@/config/healthRules";

/** ====== Tipos/Helpers locais (para evitar dependências que quebraram) ====== */
type Severity = "green" | "amber" | "red" | "gray";
type EstadoStr = "ABERTO" | "FECHADO" | "ERRO" | "DESCONHECIDO";

/** KPI local (substitui KpiCard) */
function LocalKpi(props: { title: string; value: React.ReactNode; unit?: string; severity?: Severity }) {
  const { title, value, unit, severity = "gray" } = props;
  const border =
    severity === "green"
      ? "border-emerald-600/40"
      : severity === "amber"
      ? "border-amber-600/40"
      : severity === "red"
      ? "border-red-600/40"
      : "border-border/60";

  const badge =
    severity === "green"
      ? "text-emerald-600"
      : severity === "amber"
      ? "text-amber-600"
      : severity === "red"
      ? "text-red-600"
      : "text-muted-foreground";

  return (
    <Card className={`p-4 border ${border}`}>
      <div className="text-[11px] tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className={`text-xl font-semibold ${badge}`}>{value}</div>
        {unit ? <div className="text-xs text-muted-foreground">{unit}</div> : null}
      </div>
    </Card>
  );
}

/** Tenta obter facets (S1/S2) a partir de várias formas de payload */
function deriveFacets(a: any): { S1: 0 | 1; S2: 0 | 1 } | null {
  if (!a) return null;

  // 1) Já vem como facets numéricas
  if (a.facets && typeof a.facets.S1 === "number" && typeof a.facets.S2 === "number") {
    const S1 = a.facets.S1 ? 1 : 0;
    const S2 = a.facets.S2 ? 1 : 0;
    return { S1, S2 };
  }

  // 2) Legado: flags separadas
  const to01 = (v: any) => (v === true || v === 1 ? 1 : 0) as 0 | 1;
  const hasLegacy =
    a.recuado !== undefined || a.avancado !== undefined || a.S1 !== undefined || a.S2 !== undefined;
  if (hasLegacy) {
    const S1 = a.S1 !== undefined ? to01(a.S1) : to01(a.recuado);
    const S2 = a.S2 !== undefined ? to01(a.S2) : to01(a.avancado);
    return { S1, S2 };
  }

  // 3) Texto de estado
  const st = String(a.state ?? "").toUpperCase();
  if (st.includes("RECU")) return { S1: 1, S2: 0 };
  if (st.includes("AVAN")) return { S1: 0, S2: 1 };

  // 4) Sem info suficiente => transição/indefinido
  return null;
}

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

function formatDuration(ms?: number | null): string {
  if (!Number.isFinite(ms as number) || (ms as number) < 0) return "—";
  const totalSec = Math.floor((ms as number) / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

function sinceTs(ts?: string | null): string {
  if (!ts) return "—";
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  return formatDuration(diff);
}

/** ======================= Componente principal ======================= */
export default function StatusOverview() {
  const { snapshot } = useLive();
  const sAny = snapshot as any; // flexível para campos opcionais do backend

  // -------- Sistema --------
  const statusSistema: SystemStatus = useMemo(() => {
    const raw = String(sAny?.system?.status ?? "unknown").toLowerCase();
    if (raw === "ok" || raw === "degraded" || raw === "offline") return raw as SystemStatus;
    if (raw === "down") return "offline";
    return "unknown";
  }, [sAny?.system?.status]);

  const statusSistemaText = useMemo(() => {
    if (statusSistema === "ok") return "Online";
    if (statusSistema === "degraded") return "Degraded";
    if (statusSistema === "offline") return "Offline";
    return "…";
  }, [statusSistema]);

  const sevSistema: Severity = rules.systemToSeverity(statusSistema) as Severity;

  // -------- Runtime (sem RuntimeTicker: usa runtime_ms direto, formatado) --------
  const runtimeText = useMemo<string>(() => {
    const ms = Number(sAny?.system?.runtime_ms ?? 0);
    return formatDuration(Number.isFinite(ms) ? ms : 0);
  }, [sAny?.system?.runtime_ms]);

  // -------- Atuadores --------
  const selected: 1 | 2 | null = useMemo(() => {
    const sel = sAny?.selectedActuator;
    return sel === 1 || sel === 2 ? (sel as 1 | 2) : null;
  }, [sAny?.selectedActuator]);

  const a1 = useMemo(() => {
    const row = (sAny?.actuators ?? []).find((a: any) => Number(a?.id ?? a?.actuator_id) === 1) ?? null;
    return row;
  }, [sAny?.actuors, sAny?.actuators]); // dupla key por segurança em hot-reload

  const a2 = useMemo(() => {
    const row = (sAny?.actuators ?? []).find((a: any) => Number(a?.id ?? a?.actuator_id) === 2) ?? null;
    return row;
  }, [sAny?.actuators]);

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
        <LocalKpi title="STATUS DO SISTEMA" value={statusSistemaText} severity={sevSistema} />

        {/* Runtime atual (formatação HH:MM:SS) */}
        <LocalKpi title="RUNTIME" value={<span className="font-mono">{runtimeText}</span>} severity="gray" />

        {list.map(({ id, row }) => {
          const facets = deriveFacets(row);
          const estado = estadoFromFacets(facets);
          const sevEstado = estadoSeverity(estado);

          // aceita diferentes campos vindos do backend: cycles, totalCycles, cpm, etc.
          const cyclesRaw = row?.cycles ?? row?.totalCycles ?? row?.cpm ?? row?.count ?? 0;
          const cycles = Number.isFinite(Number(cyclesRaw)) ? Number(cyclesRaw) : 0;
          const sevCycles = cyclesSeverity(cycles);

          const tsRaw: string | null =
            (typeof row?.ts === "string" ? row?.ts : undefined) ??
            (typeof row?.ts_utc === "string" ? row?.ts_utc : undefined) ??
            (typeof sAny?.ts === "string" ? sAny?.ts : undefined) ??
            null;
          const tempo = sinceTs(tsRaw);

          return (
            <React.Fragment key={id}>
              <LocalKpi title={`ESTADO ATUAL (A${id})`} value={estado} severity={sevEstado} />
              <LocalKpi title={`CICLOS (A${id})`} value={cycles} unit="ciclos" severity={sevCycles} />
              <LocalKpi title={`ÚLTIMO EVENTO (A${id})`} value={tempo} severity="gray" />
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
