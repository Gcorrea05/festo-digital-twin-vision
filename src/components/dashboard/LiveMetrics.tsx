// src/components/dashboard/LiveMetrics.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";

/** ms -> "Xd HH:MM:SS" ou "HH:MM:SS" */
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

const LiveMetrics: React.FC = () => {
  const { snapshot } = useLive();

  // ticker local p/ atualizar o relógio “Last update”
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // System text a partir do status do contexto
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "—">(() => {
    const s = String(snapshot?.system?.status ?? "—").toLowerCase();
    if (s === "ok") return "OK";
    if (s === "degraded") return "DEGRADED";
    if (s === "offline") return "OFFLINE";
    return "—";
  }, [snapshot?.system?.status]);

  // Last update = agora - snapshot.ts (ISO do último pacote do WS)
  const lastUpdateMs = useMemo(() => {
    const ts = snapshot?.ts ? Date.parse(snapshot.ts) : NaN;
    if (!Number.isFinite(ts)) return undefined;
    return Date.now() - ts;
  }, [snapshot?.ts]);

  const lastUpdateText = useMemo(() => formatDuration(lastUpdateMs), [lastUpdateMs]);

  // ids exibidos: se houver filtro no contexto, mostra só 1; senão 1 e 2
  const shownIds: (1 | 2)[] =
    snapshot?.selectedActuator === 1 || snapshot?.selectedActuator === 2
      ? [snapshot.selectedActuator]
      : [1, 2];

  // estados direto do snapshot (state = "RECUADO" | "AVANÇADO" | "DESCONHECIDO")
  const displayStates = useMemo(() => {
    const acts = snapshot?.actuators ?? [];
    return shownIds.map((id) => {
      const a = acts.find((x) => x.id === id);
      const state = a?.state ?? "DESCONHECIDO";
      return { id, state };
    });
  }, [snapshot?.actuators, shownIds]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Live Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-muted-foreground mb-1">System</div>
            <div className="text-2xl font-semibold leading-none tracking-tight">{systemText}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Last update</div>
            <div className="text-2xl font-semibold leading-none tracking-tight">
              {lastUpdateText}
            </div>
          </div>
        </div>

        <div className="pt-6">
          <div className="text-sm text-muted-foreground mb-2">Actuators</div>
          <div className="flex flex-col gap-2">
            {displayStates.map(({ id, state }) => (
              <div key={id} className="flex items-center gap-3">
                <div className="w-12 text-xs font-semibold">AT{id}:</div>
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

export default LiveMetrics;
