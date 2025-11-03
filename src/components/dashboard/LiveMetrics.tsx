import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLive } from "@/context/LiveContext";
import { useActuatorSelection } from "@/context/ActuatorSelectionContext";

type StableState = "RECUADO" | "AVANÇADO";
type PendingCmd = "AV" | "REC" | null;

const LiveMetrics: React.FC = () => {
  const { snapshot } = useLive();
  const { selectedId } = useActuatorSelection(); // 1 | 2

  // ===== Deriva "saúde" pelo atraso do snapshot =====
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "—">(() => {
    const ts = snapshot?.ts;
    if (!ts) return "—";
    const now = Date.now();
    const t = Date.parse(ts);
    if (Number.isNaN(t)) return "—";
    const ageMs = now - t;
    // heurística: até 2s OK, até 10s degradado, >10s offline
    if (ageMs <= 2000) return "OK";
    if (ageMs <= 10000) return "DEGRADED";
    return "OFFLINE";
  }, [snapshot?.ts]);

  // ===== Atuador selecionado =====
  const shownId: 1 | 2 = selectedId as 1 | 2;

  const display = useMemo(() => {
    const a = (snapshot?.actuators ?? []).find((x) => x.id === shownId);
    const state: StableState = (a?.state as StableState) ?? "RECUADO";
    const pending: PendingCmd = (a?.pending as PendingCmd) ?? null;
    return { id: shownId, state, pending };
  }, [snapshot?.actuators, shownId]);

  const label =
    display.state === "AVANÇADO" ? "ABERTO" : display.state === "RECUADO" ? "RECUADO" : "—";

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
            {snapshot?.ts && (
              <div className="text-xs text-slate-400 mt-1">
                last: {new Date(snapshot.ts).toLocaleTimeString()}
              </div>
            )}
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

              {/* Indica transição (pending) */}
              {display.pending && (
                <Badge variant="outline" className="ml-2 animate-pulse">
                  em transição: {display.pending === "AV" ? "ABRINDO" : "FECHANDO"}
                </Badge>
              )}
            </div>

            {/* Pequeno rodapé técnico */}
            <div className="text-xs text-slate-400">
              Atualiza a cada ~100&nbsp;ms por WebSocket. Estados derivados de S1/S2 com
              congelamento em STOP para evitar “meio ciclo invertido”.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveMetrics;
