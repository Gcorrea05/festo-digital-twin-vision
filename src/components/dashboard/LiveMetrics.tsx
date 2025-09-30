// src/components/dashboard/LiveMetrics.tsx
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";

function stateFromFacets(f?: { S1: 0 | 1; S2: 0 | 1 }): "ABERTO" | "RECUADO" | "—" {
  if (!f) return "—";
  const { S1, S2 } = f;
  if (S1 === 1 && S2 === 0) return "RECUADO";
  if (S2 === 1 && S1 === 0) return "ABERTO";
  return "—";
}

const LiveMetrics: React.FC = () => {
  const { snapshot } = useLive();

  // system text
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "—">(() => {
    const s = String(snapshot?.system?.status ?? "—").toLowerCase();
    if (s === "ok") return "OK";
    if (s === "degraded") return "DEGRADED";
    if (s === "down" || s === "offline") return "OFFLINE";
    return "—";
  }, [snapshot]);

  // quais atuadores exibir: o selecionado no 3D ou ambos
  const shownIds: (1 | 2)[] =
    snapshot?.selectedActuator === 1 || snapshot?.selectedActuator === 2
      ? [snapshot.selectedActuator]
      : [1, 2];

  // linhas a exibir (na ordem dos IDs exibidos)
  const rows = useMemo(() => {
    const acts = snapshot?.actuators ?? [];
    return shownIds
      .map((id) => acts.find((a) => a.id === id))
      .filter(Boolean) as Array<{
        id: 1 | 2;
        facets?: { S1: 0 | 1; S2: 0 | 1 };
        cycles?: number;
        totalCycles?: number;
      }>;
  }, [snapshot, shownIds]);

  // total de ciclos: se 1 atuador, mostra só dele; senão soma
  const totalCycles = useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((acc, a) => acc + Number(a.totalCycles ?? a.cycles ?? 0), 0);
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Live Metrics (último valor gravado)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* System */}
          <div>
            <div className="text-sm text-muted-foreground mb-1">System</div>
            <div className="text-2xl font-semibold leading-none tracking-tight">{systemText}</div>
          </div>

          {/* Total de Ciclos */}
          <div>
            <div className="text-sm text-muted-foreground mb-1">Total de Ciclos</div>
            <div className="text-2xl font-semibold leading-none tracking-tight">
              {Number.isFinite(totalCycles) ? totalCycles : 0}
            </div>
          </div>
        </div>

        {/* Actuators */}
        <div className="pt-6">
          <div className="text-sm text-muted-foreground mb-2">Actuators</div>
          <div className="flex flex-col gap-2">
            {rows.map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <div className="w-12 text-xs font-semibold">AT{a.id}:</div>
                <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium uppercase">
                  {stateFromFacets(a.facets)}
                </span>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="text-xs text-muted-foreground">Nenhum atuador disponível.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveMetrics;
