// src/components/dashboard/LiveMetrics.tsx
// Versão enxuta: segue o atuador selecionado e mostra apenas:
// ESTADO ATUAL, STATUS SISTEMA, CPM e TEMPO DE ATIVIDADE.

import React, { useEffect, useMemo, useState } from "react";
import { useLive } from "@/context/LiveContext";
import { useActuatorSelection } from "@/context/ActuatorSelectionContext";
import KpiCard from "./KpiCard";
import { getOPCHistory } from "@/lib/api";

type Facets = {
  S1?: 0 | 1;
  S2?: 0 | 1;
  INICIA?: 0 | 1;
  PARA?: 0 | 1;
  V_AVANCO?: 0 | 1;
  V_RECUO?: 0 | 1;
};

function statusFromFacets(f: Facets | undefined) {
  if (!f) return { label: "—", sev: "gray" as const };
  const a = f.S1 === 1;
  const b = f.S2 === 1;
  if (a && !b) return { label: "ABERTO", sev: "green" as const };
  if (!a && b) return { label: "FECHADO", sev: "green" as const };
  if (a && b) return { label: "CONFLITO", sev: "red" as const };
  return { label: "TRANSIÇÃO", sev: "amber" as const };
}

function sevSystem(mode?: string) {
  const m = (mode ?? "").toUpperCase();
  if (m === "LIVE") return "green";
  if (m === "DEMO") return "amber";
  if (m === "DESLIGADO") return "red";
  return "gray";
}

function formatDurationMs(ms: number): string {
  if (ms <= 0 || !Number.isFinite(ms)) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}

export default function LiveMetrics() {
  const { snapshot } = useLive();
  const { selectedId } = useActuatorSelection();

  const act = snapshot?.actuators?.find((a) => a?.id === selectedId) ?? snapshot?.actuators?.[selectedId - 1];
  const st = statusFromFacets(act?.facets);
  const cpm = act?.cpm ?? null;

  // STATUS DO SISTEMA (só printa o que vier do backend)
  const systemMode = snapshot?.system?.mode ?? "—";
  const systemSev = sevSystem(systemMode);

  // TEMPO DE ATIVIDADE: desde o primeiro INICIA nas últimas 12h
  const [uptimeMs, setUptimeMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadFirstInicia() {
      try {
        const hist = await getOPCHistory({
          actuatorId: selectedId,
          facet: "INICIA",
          since: "-12h",
          limit: 1,
          asc: true,
        });
        if (cancelled) return;
        const first = hist?.[0];
        if (!first) {
          setUptimeMs(null);
          return;
        }
        const t0 = new Date(first.ts).getTime();
        const tick = () => {
          if (cancelled) return;
          setUptimeMs(Date.now() - t0);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
      } catch {
        if (!cancelled) setUptimeMs(null);
      }
    }
    loadFirstInicia();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
    <KpiCard
      title={`ESTADO ATUAL (A${selectedId})`}
      value={st.label}
      severity={st.sev}
    />
    <KpiCard
      title="STATUS DO SISTEMA"
      value={String(systemMode)}
      severity={systemSev}
    />
    <KpiCard
      title="CPM"
      value={cpm ?? "—"}
      unit="ciclos/min"
      severity={cpm == null ? "gray" : "green"}
      decimals={0}
    />
    <KpiCard
      title="TEMPO DE ATIVIDADE"
      value={uptimeMs == null ? "—" : formatDurationMs(uptimeMs)}
      severity={uptimeMs == null ? "gray" : "green"}
    />
  </div>
);
}