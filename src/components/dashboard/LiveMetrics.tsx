// src/components/dashboard/LiveMetrics.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";
import { useActuatorSelection } from "@/context/ActuatorSelectionContext";

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

function toMillis(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) {
    return v < 1e12 ? Math.round(v * 1000) : v; // segundos → ms
  }
  if (typeof v === "string") {
    const iso = Date.parse(v);
    if (!Number.isNaN(iso)) return iso;
    const n = Number(v);
    if (Number.isFinite(n)) return n < 1e12 ? Math.round(n * 1000) : n;
  }
  return undefined;
}

const LiveMetrics: React.FC = () => {
  const { snapshot } = useLive();
  const { selectedId } = useActuatorSelection(); // ⬅️ vem do botão Modelo 1/2

  // ticker local p/ atualizar o “runtime” em tempo real
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Status do sistema
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "—">(() => {
    const s = String(snapshot?.system?.status ?? "—").toLowerCase();
    if (s === "ok") return "OK";
    if (s === "degraded") return "DEGRADED";
    if (s === "offline" || s === "down") return "OFFLINE";
    return "—";
  }, [snapshot?.system?.status]);

  const statusOk = useMemo(() => {
    const s = String(snapshot?.system?.status ?? "").toLowerCase();
    return s === "ok";
  }, [snapshot?.system?.status]);

  // ==== RUNTIME (uptime do sistema) ====
  const startedAtMs = toMillis((snapshot as any)?.system?.startedAt);
  const lastHbMs = toMillis((snapshot as any)?.system?.lastHeartbeatAt);
  const baseRuntimeSec = Number((snapshot as any)?.system?.runtime ?? 0);

  // "agora" usado no cálculo: se o sistema não estiver rodando, congelamos no último heartbeat
  const referenceNowMs = statusOk ? nowMs : (lastHbMs ?? nowMs);

  const runtimeMs = useMemo(() => {
    if (startedAtMs != null) {
      const ref = lastHbMs ?? referenceNowMs;
      const effectiveNow = statusOk ? referenceNowMs : ref; // congela se offline
      return Math.max(0, effectiveNow - startedAtMs);
    }
    const baseMs = Number.isFinite(baseRuntimeSec) ? baseRuntimeSec * 1000 : 0;
    if (!lastHbMs) return baseMs;
    const deltaMs = Math.max(0, referenceNowMs - lastHbMs);
    return statusOk ? baseMs + deltaMs : baseMs; // congela se offline
  }, [startedAtMs, lastHbMs, referenceNowMs, statusOk, baseRuntimeSec]);

  const runtimeText = useMemo(() => formatDuration(runtimeMs), [runtimeMs]);

  // ==== SELEÇÃO DE ATUADOR: mostra só o escolhido ====
  // prioridade total ao contexto; se por algum motivo não existir, caímos no snapshot
  const effectiveSelected: 1 | 2 | undefined = useMemo(() => {
    if (selectedId === 1 || selectedId === 2) return selectedId;
    const snapSel = (snapshot as any)?.selectedActuator;
    if (snapSel === 1 || snapSel === 2) return snapSel;
    return undefined;
  }, [selectedId, snapshot]);

  const shownIds: (1 | 2)[] = useMemo(() => {
    return effectiveSelected ? [effectiveSelected] : [];
  }, [effectiveSelected]);

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
            <div className="text-sm text-muted-foreground mb-1">Last update (runtime)</div>
            <div className="text-2xl font-semibold leading-none tracking-tight">
              {runtimeText}
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
              <div className="text-xs text-muted-foreground">Nenhum atuador selecionado.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveMetrics;
