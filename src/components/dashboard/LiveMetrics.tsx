// src/components/dashboard/LiveMetrics.tsx
import React, { useMemo, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";
import { getActuatorsState, getCyclesTotal } from "@/lib/api";

type EstadoStr = "AVANÇADO" | "RECUADO" | "DESCONHECIDO";

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
  | { actuator_id: number; state: string }
  | { id: number | string; state: string }; // tolera variações

type ActId = 1 | 2;

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
  const [apiStates, setApiStates] = useState<Array<{ id: ActId; state: EstadoStr }> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await getActuatorsState();
        const norm = (resp?.actuators ?? []) as ApiActuatorItem[];
        const mapped: Array<{ id: ActId; state: EstadoStr }> = norm
          .map((a) => {
            const rawId = (a as any).actuator_id ?? (a as any).id;
            const n = typeof rawId === "string" ? parseInt(rawId.replace(/\D/g, ""), 10) : Number(rawId);
            const id: ActId = n === 1 ? 1 : 2;
            const s = (a as any).state?.toString().toUpperCase();
            const state: EstadoStr = s === "AVANÇADO" || s === "RECUADO" ? s : "DESCONHECIDO";
            return { id, state };
          })
          .filter((x) => x.id === 1 || x.id === 2);
        if (alive) setApiStates(mapped.length ? mapped : null);
      } catch {
        if (alive) setApiStates(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---------- Fallback a partir do snapshot (quando API indisponível) ----------
  const a1 = useMemo(() => snapshot?.actuators?.find((a: any) => a.id === 1) ?? null, [snapshot]);
  const a2 = useMemo(() => snapshot?.actuators?.find((a: any) => a.id === 2) ?? null, [snapshot]);

  // linhas vindas da API (preferidas)
  const rowsFromApi = useMemo(() => {
    if (!apiStates) return null;
    const map = new Map(apiStates.map((x) => [x.id, x.state]));
    return ([1, 2] as const).map((id) => ({
      id: id as ActId,
      state: (map.get(id as ActId) ?? "DESCONHECIDO") as EstadoStr,
      // ciclos ainda vêm do endpoint dedicado (abaixo)
      cycles: Number(((id === 1 ? (a1 as any) : (a2 as any))?.cycles
        ?? (id === 1 ? (a1 as any) : (a2 as any))?.totalCycles
        ?? (id === 1 ? a1?.cpm : a2?.cpm)
        ?? 0) as number),
    }));
  }, [apiStates, a1, a2]);

  // linhas de fallback via facets do snapshot
  const rowsFromSnapshot = useMemo(
    () =>
      ([a1, a2] as const).map((a, idx) => ({
        id: (idx + 1) as ActId,
        state: a ? estadoFromFacets((a as any)?.facets) : ("DESCONHECIDO" as EstadoStr),
        cycles: Number(((a as any)?.cycles ?? (a as any)?.totalCycles ?? (a as any)?.cpm ?? 0) as number),
      })),
    [a1, a2]
  );

  const rowsAll = rowsFromApi ?? rowsFromSnapshot;

  // ---------- Total de ciclos: APENAS do atuador selecionado ----------
  const [cyclesByAct, setCyclesByAct] = useState<Record<ActId, number>>({ 1: 0, 2: 0 });

  useEffect(() => {
    let alive = true;
    const fetchOnce = async () => {
      try {
        const data = await getCyclesTotal();
        const arr = (data?.actuators ?? []) as Array<{ actuator_id: number; cycles: number }>;
        const map: Record<ActId, number> = { 1: 0, 2: 0 };
        for (const it of arr) {
          const n = Number(it.actuator_id) === 1 ? 1 : 2;
          map[n as ActId] = Number(it.cycles ?? 0);
        }
        if (alive) setCyclesByAct(map);
      } catch {
        if (alive) setCyclesByAct({ 1: 0, 2: 0 });
      }
    };

    // primeira chamada imediata
    fetchOnce();
    // polling leve (1s)
    const id = setInterval(fetchOnce, 1000);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const rows = useMemo(
    () => (selected ? rowsAll.filter((r) => r.id === selected) : rowsAll),
    [rowsAll, selected]
  );

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

        {/* Atuadores (AVANÇADO/RECUADO) */}
        <div className="sm:col-span-3">
          <p className="text-sm text-muted-foreground">Actuators</p>
          <ul className="text-sm space-y-1">
            {rows.map((a) => (
              <li key={a.id}>AT{a.id}: {a.state}</li>
            ))}
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
