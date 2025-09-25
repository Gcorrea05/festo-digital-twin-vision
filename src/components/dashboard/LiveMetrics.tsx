// src/components/dashboard/LiveMetrics.tsx
import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";

type EstadoStr = "AVANÇADO" | "RECUADO" | "TRANSIÇÃO" | "DESCONHECIDO";

function estadoFromFacets(facets?: { S1?: 0 | 1; S2?: 0 | 1 } | null): EstadoStr {
  if (!facets) return "DESCONHECIDO";
  if (facets.S2 === 1 && facets.S1 !== 1) return "AVANÇADO";
  if (facets.S1 === 1 && facets.S2 !== 1) return "RECUADO";
  if (facets.S1 == null && facets.S2 == null) return "DESCONHECIDO";
  return "TRANSIÇÃO";
}

export default function LiveMetrics() {
  const { snapshot } = useLive();

  // System
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "…">(() => {
    const s = (snapshot?.system?.status ?? "unknown").toString().toLowerCase();
    if (s === "ok") return "OK";
    if (s === "degraded") return "DEGRADED";
    if (s === "offline" || s === "down") return "OFFLINE";
    return "…";
  }, [snapshot]);

  // Actuators A1/A2
  const a1 = useMemo(() => snapshot?.actuators?.find((a) => a.id === 1) ?? null, [snapshot]);
  const a2 = useMemo(() => snapshot?.actuators?.find((a) => a.id === 2) ?? null, [snapshot]);

  const rows = useMemo(
    () =>
      ([a1, a2] as const)
        .map((a, idx) =>
          a
            ? {
                id: (idx + 1) as 1 | 2,
                state: estadoFromFacets(a.facets),
                cpm: Number(a.cpm ?? 0),
              }
            : {
                id: (idx + 1) as 1 | 2,
                state: "DESCONHECIDO" as EstadoStr,
                cpm: 0,
              }
        ),
    [a1, a2]
  );

  const totalCpm = useMemo(() => rows.reduce((acc, r) => acc + (r.cpm || 0), 0), [rows]);

  // MPU (se o LiveContext já tiver o último sample)
  const mpu = snapshot?.mpu
    ? {
        ax: snapshot.mpu.ax,
        ay: snapshot.mpu.ay,
        az: snapshot.mpu.az,
      }
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

        {/* CPM total */}
        <div>
          <p className="text-sm text-muted-foreground">Total CPM</p>
          <p className="text-lg font-bold">{totalCpm}</p>
        </div>

        {/* Atuadores */}
        <div className="sm:col-span-3">
          <p className="text-sm text-muted-foreground">Actuators</p>
          <ul className="text-sm space-y-1">
            {rows.map((a) => (
              <li key={a.id}>
                AT{a.id}: {a.state} — {a.cpm ?? "—"} CPM
              </li>
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
