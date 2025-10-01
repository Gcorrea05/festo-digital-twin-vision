import React, { useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";

function decideStateFromFacets(
  f: { S1: 0 | 1; S2: 0 | 1 } | undefined,
  prev: "ABERTO" | "RECUADO" | "—"
): "ABERTO" | "RECUADO" | "—" {
  if (!f) return prev;
  const { S1, S2 } = f;
  if (S1 === 1 && S2 === 0) return "RECUADO";
  if (S1 === 0 && S2 === 1) return "ABERTO";
  if (S1 === 0 && S2 === 0) return prev; // mantém
  return prev; // 1/1: mantém (outra camada pode exibir erro se quiser)
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

  // ids exibidos
  const shownIds: (1 | 2)[] =
    snapshot?.selectedActuator === 1 || snapshot?.selectedActuator === 2
      ? [snapshot.selectedActuator]
      : [1, 2];

  // guarda último estado estável por atuador
  const lastStableRef = useRef<Record<number, "ABERTO" | "RECUADO" | "—">>({ 1: "—", 2: "—" });

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

  // atualiza lastStable a cada render com base na regra
  const displayStates = rows.map((a) => {
    const prev = lastStableRef.current[a.id] ?? "—";
    const next = decideStateFromFacets(a.facets as any, prev);
    if (next !== "—") lastStableRef.current[a.id] = next;
    return { id: a.id, state: next };
  });

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
          <div>
            <div className="text-sm text-muted-foreground mb-1">System</div>
            <div className="text-2xl font-semibold leading-none tracking-tight">{systemText}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Total de Ciclos</div>
            <div className="text-2xl font-semibold leading-none tracking-tight">
              {Number.isFinite(totalCycles) ? totalCycles : 0}
            </div>
          </div>
        </div>

        <div className="pt-6">
          <div className="text-sm text-muted-foreground mb-2">Actuators</div>
          <div className="flex flex-col gap-2">
            {displayStates.map(({ id, state }) => (
              <div key={id} className="flex items-center gap-3">
                <div className="w-12 text-xs font-semibold">AT{ID_TO_STR(id)}:</div>
                <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium uppercase">
                  {state}
                </span>
              </div>
            ))}
            {displayStates.length === 0 && (
              <div className="text-xs text-muted-foreground">Nenhum atuador disponível.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

function ID_TO_STR(id: number) { return id; }

export default LiveMetrics;
