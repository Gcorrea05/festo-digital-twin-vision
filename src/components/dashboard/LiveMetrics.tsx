// src/components/dashboard/LiveMetrics.tsx
import React, { useMemo, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";
import { getActuatorsState, getCyclesTotal } from "@/lib/api";

type EstadoStr = "AVANÇADO" | "RECUADO" | "DESCONHECIDO";
type ActId = 1 | 2;

// fallback quando só temos facets (S1=Recuado, S2=Avançado)
function estadoFromFacets(facets?: { S1?: 0 | 1; S2?: 0 | 1 } | null): EstadoStr {
  if (!facets) return "DESCONHECIDO";
  const R = facets.S1 ?? null; // Recuado_?S1
  const A = facets.S2 ?? null; // Avancado_?S2
  if (R === 1 && A === 0) return "RECUADO";
  if (A === 1 && R === 0) return "AVANÇADO";
  return "DESCONHECIDO";
}

type ApiActuatorItem =
  | { actuator_id: number | string; state: string; pending?: "AV" | "REC" | null; fault?: string; elapsed_ms?: number; started_at?: string | null }
  | { id: number | string; state: string; pending?: "AV" | "REC" | null; fault?: string; elapsed_ms?: number; started_at?: string | null }; // tolera variações

// helper: polling sem overlap
function smartPoll(fn: () => Promise<void>, intervalMs: number) {
  let alive = true;
  let running = false;
  let timer: any;

  const loop = async () => {
    if (!alive) return;
    if (!running) {
      running = true;
      try { await fn(); } finally { running = false; }
    }
    timer = setTimeout(loop, intervalMs);
  };

  loop();
  return () => { alive = false; clearTimeout(timer); };
}

export default function LiveMetrics() {
  const { snapshot } = useLive();

  // ---------- System text ----------
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "…">(() => {
    const s = (snapshot?.system?.status ?? "unknown").toString().toLowerCase();
    if (s === "ok") return "OK";
    if (s === "degraded") return "DEGRADED";
    if (s === "offline" || s === "down") return "OFFLINE";
    return "…";
  }, [snapshot]);

  // ---------- Atuador selecionado (opcional, vindo do ThreeDModel) ----------
  const selected: ActId | null = (() => {
    const sel = (snapshot as any)?.selectedActuator;
    return sel === 1 || sel === 2 ? (sel as ActId) : null;
  })();

  // ---------- Estados vindos da API /api/live/actuators/state ----------
  const [apiStates, setApiStates] = useState<
    Array<{ id: ActId; state: EstadoStr; pending: "AV" | "REC" | null; fault: string | null; elapsed_ms: number }>
    | null
  >(null);

  useEffect(() => {
    const stop = smartPoll(async () => {
      const resp = await getActuatorsState(); // já faz no-store + cache-busting no api.ts
      const norm = (resp?.actuators ?? []) as ApiActuatorItem[];
      const mapped = norm
        .map((a) => {
          const rawId = (a as any).actuator_id ?? (a as any).id;
          const n = typeof rawId === "string" ? parseInt(rawId.replace(/\D/g, ""), 10) : Number(rawId);
          const id: ActId = n === 1 ? 1 : 2;
          const s = (a as any).state?.toString().toUpperCase();
          const state: EstadoStr = s === "AVANÇADO" || s === "RECUADO" ? s : "DESCONHECIDO";
          const pending = (a as any).pending ?? null;
          const fault = (a as any).fault ?? null;
          const elapsed_ms = Number((a as any).elapsed_ms ?? 0);
          return { id, state, pending, fault, elapsed_ms };
        })
        .filter((x) => x.id === 1 || x.id === 2);

      if (!mapped.length) {
        // Se cair em fallback (snapshot), você vai notar esse warning:
        console.warn("[LiveMetrics] API states vazios; usando snapshot como fallback");
        setApiStates(null);
      } else {
        setApiStates(mapped);
      }
    }, 200); // 200 ms

    return stop;
  }, []);

  // ---------- Fallback a partir do snapshot (quando API indisponível) ----------
  const a1 = useMemo(() => snapshot?.actuators?.find((a: any) => a.id === 1) ?? null, [snapshot]);
  const a2 = useMemo(() => snapshot?.actuators?.find((a: any) => a.id === 2) ?? null, [snapshot]);

  // linhas vindas da API (preferidas)
  const rowsFromApi = useMemo(() => {
    if (!apiStates) return null;
    const map = new Map(apiStates.map((x) => [x.id, x]));
    return ([1, 2] as const).map((id) => ({
      id: id as ActId,
      state: (map.get(id as ActId)?.state ?? "DESCONHECIDO") as EstadoStr,
      cycles: 0, // ciclos vêm do endpoint dedicado
      pending: map.get(id as ActId)?.pending ?? null,
      fault: map.get(id as ActId)?.fault ?? null,
      elapsed_ms: map.get(id as ActId)?.elapsed_ms ?? 0,
    }));
  }, [apiStates]);

  // linhas de fallback via facets do snapshot
  const rowsFromSnapshot = useMemo(
    () =>
      ([a1, a2] as const).map((a, idx) => ({
        id: (idx + 1) as ActId,
        state: a ? estadoFromFacets((a as any)?.facets) : ("DESCONHECIDO" as EstadoStr),
        cycles: Number(((a as any)?.cycles ?? (a as any)?.totalCycles ?? (a as any)?.cpm ?? 0) as number),
        pending: null,
        fault: null,
        elapsed_ms: 0,
      })),
    [a1, a2]
  );

  const rowsAll = rowsFromApi ?? rowsFromSnapshot;

  // ---------- Total de ciclos: APENAS do atuador selecionado ----------
  const [cyclesByAct, setCyclesByAct] = useState<Record<ActId, number>>({ 1: 0, 2: 0 });

  useEffect(() => {
    const stop = smartPoll(async () => {
      const data = await getCyclesTotal();
      const arr = (data?.actuators ?? []) as Array<{ actuator_id: number | string; cycles: number }>;
      const map: Record<ActId, number> = { 1: 0, 2: 0 };
      for (const it of arr) {
        const n = typeof it.actuator_id === "string" ? parseInt(it.actuator_id.replace(/\D/g, ""), 10) : Number(it.actuator_id);
        const id: ActId = n === 1 ? 1 : 2;
        map[id] = Number(it.cycles ?? 0);
      }
      setCyclesByAct(map);
    }, 300); // 300 ms (um pouco mais “leve”)
    return stop;
  }, []);

  const rows = useMemo(() => (selected ? rowsAll.filter((r) => r.id === selected) : rowsAll), [rowsAll, selected]);

  const displayedCycles = useMemo(() => {
    if (!selected) return 0; // mostra só do selecionado
    return cyclesByAct[selected] ?? 0;
  }, [cyclesByAct, selected]);

  const mpu = snapshot?.mpu
    ? { ax: snapshot.mpu.ax, ay: snapshot.mpu.ay, az: snapshot.mpu.az }
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Metrics (último valor gravado)</CardTitle>
      </CardHeader>

      <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Status do sistema */}
        <div>
          <p className="text-sm text-muted-foreground">System</p>
          <p className="text-lg font-bold">{systemText}</p>
        </div>

        {/* Total de Ciclos — apenas do atuador selecionado */}
        <div>
          <p className="text-sm text-muted-foreground">Total de Ciclos</p>
          <p className="text-lg font-bold">{displayedCycles}</p>
          {!selected && (
            <p className="text-xs text-muted-foreground mt-1">Selecione um atuador para ver o total.</p>
          )}
        </div>

        {/* Atuadores (AVANÇADO/RECUADO) + pendências/falhas */}
        <div className="sm:col-span-3">
          <p className="text-sm text-muted-foreground">Actuators</p>
          <ul className="text-sm space-y-1">
            {rows.map((a) => {
              const pendingTxt =
                (a as any).pending === "AV" ? "indo → AV" : (a as any).pending === "REC" ? "indo → REC" : null;
              const fault = (a as any).fault;
              const showFault = fault && fault !== "NONE";
              return (
                <li key={a.id} className="flex items-center gap-2">
                  <span>AT{a.id}:</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      a.state === "AVANÇADO"
                        ? "bg-emerald-100 text-emerald-700"
                        : a.state === "RECUADO"
                        ? "bg-sky-100 text-sky-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {a.state}
                  </span>
                  {pendingTxt && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                      {pendingTxt}
                    </span>
                  )}
                  {showFault && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-rose-100 text-rose-700">
                      {(fault as string).replace("FAULT_", "")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* MPU opcional */}
        {mpu && (
          <div className="sm:col-span-3">
            <p className="text-sm text-muted-foreground">MPU</p>
            <p className="text-xs">
              ax: {mpu.ax.toFixed(2)} | ay: {mpu.ay.toFixed(2)} | az: {mpu.az.toFixed(2)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
