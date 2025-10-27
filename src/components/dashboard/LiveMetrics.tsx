import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLive } from "@/context/LiveContext";
import { useActuatorSelection } from "@/context/ActuatorSelectionContext";

type StableState = "RECUADO" | "AVANÇADO" | "DESCONHECIDO";

const LiveMetrics: React.FC = () => {
  const { snapshot } = useLive();
  const { selectedId } = useActuatorSelection(); // A1/A2 da UI (fonte da verdade)

  // ===== System status =====
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "—">(() => {
    const s = String(snapshot?.system?.status ?? "—").toLowerCase();
    if (s === "ok") return "OK";
    if (s === "degraded") return "DEGRADED";
    if (s === "offline" || s === "down") return "OFFLINE";
    return "—";
  }, [snapshot?.system?.status]);

  // ===== ID efetivo a mostrar (sempre o escolhido na UI) =====
  const shownId: 1 | 2 = selectedId; // <<— sem depender do snapshot.selectedActuator

  // ===== Estado do atuador selecionado =====
  const display = useMemo(() => {
    const acts = snapshot?.actuators ?? [];
    const a = acts.find((x) => x.id === shownId);
    const state: StableState = (a?.state as StableState) ?? "DESCONHECIDO";
    return { id: shownId, state };
  }, [snapshot?.actuators, shownId]);

  // ===== Label/variant =====
  const label =
    display.state === "AVANÇADO"
      ? "ABERTO"
      : display.state === "RECUADO"
      ? "RECUADO"
      : "DESCONHECIDO";

  const variant =
    label === "ABERTO" ? "success" : label === "RECUADO" ? "secondary" : "outline";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Live Metrics</CardTitle>
      </CardHeader>

      <CardContent>
        {/* Linha superior: System */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-sm md:text-base text-slate-300 font-semibold uppercase tracking-wider">
              System
            </div>
            <div className="text-xl md:text-2xl font-extrabold">{systemText}</div>
          </div>
        </div>

        {/* Atuador selecionado */}
        <div className="pt-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-16 text-base md:text-lg font-bold">AT{display.id}:</div>
              <Badge size="lg" variant={variant as any} className="select-none uppercase">
                {label}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveMetrics;
