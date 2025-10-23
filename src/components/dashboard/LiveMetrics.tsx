// src/components/dashboard/LiveMetrics.tsx
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLive } from "@/context/LiveContext";
import { useActuatorSelection } from "@/context/ActuatorSelectionContext";

type StableState = "RECUADO" | "AVANÇADO" | "DESCONHECIDO";

const LiveMetrics: React.FC = () => {
  const { snapshot } = useLive();
  const { selectedId } = useActuatorSelection(); // “Modelo 1/2”

  // ===== System status (moderado) =====
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "—">(() => {
    const s = String(snapshot?.system?.status ?? "—").toLowerCase();
    if (s === "ok") return "OK";
    if (s === "degraded") return "DEGRADED";
    if (s === "offline" || s === "down") return "OFFLINE";
    return "—";
  }, [snapshot?.system?.status]);

  // ===== Seleção do atuador (mostra só o escolhido) =====
  const effectiveSelected: 1 | 2 | undefined = useMemo(() => {
    if (selectedId === 1 || selectedId === 2) return selectedId;
    const snapSel = (snapshot as any)?.selectedActuator;
    if (snapSel === 1 || snapSel === 2) return snapSel;
    return undefined;
  }, [selectedId, snapshot]);

  const shownIds: (1 | 2)[] = useMemo(
    () => (effectiveSelected ? [effectiveSelected] : []),
    [effectiveSelected]
  );

  // estados direto do snapshot
  const displayStates = useMemo(() => {
    const acts = snapshot?.actuators ?? [];
    return shownIds.map((id) => {
      const a = acts.find((x) => x.id === id);
      const state: StableState = (a?.state as StableState) ?? "DESCONHECIDO";
      return { id, state };
    });
  }, [snapshot?.actuators, shownIds]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Live Metrics</CardTitle>
      </CardHeader>

      <CardContent>
        {/* Linha superior: System (runtime removido) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-sm md:text-base text-slate-300 font-semibold uppercase tracking-wider">
              System
            </div>
            <div className="text-xl md:text-2xl font-extrabold">{systemText}</div>
          </div>
        </div>

        {/* Lista de Atuadores com TAGs maiores (padrão moderado) */}
        <div className="pt-5">
          <div className="flex flex-col gap-3">
            {displayStates.map(({ id, state }) => {
              const label =
                state === "AVANÇADO"
                  ? "ABERTO"
                  : state === "RECUADO"
                  ? "RECUADO"
                  : "DESCONHECIDO";

              const variant =
                label === "ABERTO"
                  ? "success"
                  : label === "RECUADO"
                  ? "secondary"
                  : "outline";

              return (
                <div key={id} className="flex items-center gap-3">
                  <div className="w-16 text-base md:text-lg font-bold">AT{id}:</div>
                  <Badge size="lg" variant={variant as any} className="select-none uppercase">
                    {label}
                  </Badge>
                </div>
              );
            })}

            {displayStates.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Nenhum atuador selecionado.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveMetrics;
