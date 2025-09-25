// src/components/dashboard/LiveMetrics.tsx
import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";

type EstadoStr = "ABERTO" | "FECHADO" | "ERRO" | "DESCONHECIDO";

function estadoFromFacets(facets?: { S1?: 0 | 1; S2?: 0 | 1 } | null): EstadoStr {
  if (!facets) return "DESCONHECIDO";
  const R = facets.S1 ?? null; // Recuado_?S1
  const A = facets.S2 ?? null; // Avancado_?S2
  if (R === 1 && A === 0) return "FECHADO";
  if (A === 1 && R === 0) return "ABERTO";
  if (R === 1 && A === 1) return "ERRO";
  return "DESCONHECIDO";
}

export default function LiveMetrics() {
  const { snapshot } = useLive();

  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "…">(() => {
    const s = (snapshot?.system?.status ?? "unknown").toString().toLowerCase();
    if (s === "ok") return "OK";
    if (s === "degraded") return "DEGRADED";
    if (s === "offline" || s === "down") return "OFFLINE";
    return "…";
  }, [snapshot]);

  // Atuador selecionado (opcional, vindo do ThreeDModel)
  const selected: 1 | 2 | null = (() => {
    const sel = (snapshot as any)?.selectedActuator;
    return sel === 1 || sel === 2 ? (sel as 1 | 2) : null;
  })();

  const a1 = useMemo(() => snapshot?.actuators?.find((a) => a.id === 1) ?? null, [snapshot]);
  const a2 = useMemo(() => snapshot?.actuators?.find((a) => a.id === 2) ?? null, [snapshot]);

  const rowsAll = useMemo(
    () =>
      ([a1, a2] as const).map((a, idx) => ({
        id: (idx + 1) as 1 | 2,
        state: a ? estadoFromFacets(a.facets) : ("DESCONHECIDO" as EstadoStr),
        // ciclos continuam sendo usados apenas para o total
        cycles: Number(((a as any)?.cycles ?? (a as any)?.totalCycles ?? a?.cpm ?? 0) as number),
      })),
    [a1, a2]
  );

  const rows = useMemo(
    () => (selected ? rowsAll.filter((r) => r.id === selected) : rowsAll),
    [rowsAll, selected]
  );

  const totalCycles = useMemo(
    () => rows.reduce((acc, r) => acc + (r.cycles || 0), 0),
    [rows]
  );

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

        {/* Total de Ciclos (relativo ao filtro) */}
        <div>
          <p className="text-sm text-muted-foreground">Total de Ciclos</p>
          <p className="text-lg font-bold">{totalCycles}</p>
        </div>

        {/* Atuadores (sem “— X ciclos”) */}
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
