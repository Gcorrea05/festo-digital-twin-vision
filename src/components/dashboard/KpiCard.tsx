import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLive } from "@/context/LiveContext";

function stateFromFacets(facets?: { S1: 0 | 1; S2: 0 | 1 }): "ABERTO" | "RECUADO" | "—" {
  if (!facets) return "—";
  const { S1, S2 } = facets;
  if (S1 === 1 && S2 === 0) return "RECUADO";
  if (S2 === 1 && S1 === 0) return "ABERTO";
  return "—"; // remove outros estados
}

/** Formata ms => "Xd HH:MM:SS" ou "HH:MM:SS" */
function formatDuration(ms?: number) {
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

export default function LiveMetricsCard() {
  const { snapshot } = useLive();

  const selectedIds = useMemo<(1 | 2)[]>(() => {
    const sel = snapshot?.selectedActuator;
    if (sel === 1 || sel === 2) return [sel];
    return [1, 2]; // se nada selecionado no 3D, mostra os dois
  }, [snapshot?.selectedActuator]);

  const rows = useMemo(() => {
    const list = snapshot?.actuators ?? [];
    return selectedIds
      .map((id) => list.find((a) => a.id === id))
      .filter(Boolean)
      .map((a) => ({
        id: a!.id as 1 | 2,
        state: stateFromFacets(a!.facets),
      }));
  }, [snapshot?.actuators, selectedIds]);

  const systemText = useMemo(() => {
    const s = String(snapshot?.system?.status ?? "—").toLowerCase();
    if (s === "ok") return "OK";
    if (s === "degraded") return "DEGRADED";
    if (s === "down" || s === "offline") return "OFFLINE";
    return "…";
  }, [snapshot?.system?.status]);

  const runtimeText = useMemo(() => {
    return formatDuration(snapshot?.system?.runtime_ms);
  }, [snapshot?.system?.runtime_ms]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Live Metrics (último valor gravado)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-muted-foreground">System</div>
          <div className="font-medium">{systemText}</div>

          {/* Substituição: de "Total de Ciclos" para "Runtime" */}
          <div className="text-muted-foreground">Runtime</div>
          <div className="font-medium">{runtimeText}</div>
        </div>

        <div className="pt-2">
          <div className="text-sm text-muted-foreground mb-2">Actuators</div>
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <div className="w-12 text-xs font-semibold">AT{r.id}:</div>
                {/* só uma tag com ABERTO/RECUADO/— */}
                <Badge variant="secondary" className="uppercase">
                  {r.state}
                </Badge>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="text-xs text-muted-foreground">Nenhum atuador selecionado.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
