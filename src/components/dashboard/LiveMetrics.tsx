// src/components/dashboard/LiveMetrics.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLive } from "@/context/LiveContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type Stable = "AVANÇADO" | "RECUADO";

function computeStable(a?: { facets?: { S1?: boolean; S2?: boolean } }): Stable | null {
  if (!a?.facets) return null;
  if (a.facets.S2) return "AVANÇADO";
  if (a.facets.S1) return "RECUADO";
  return null; // transição
}

const LiveMetrics: React.FC = () => {
  const { snapshot } = useLive();

  // Mapa com o último estado estável por atuador (id -> "AVANÇADO" | "RECUADO")
  const [lastStable, setLastStable] = useState<Record<number, Stable>>({});

  // Quando chegar o primeiro snapshot, inicializa o mapa com um default por atuador (RECUADO),
  // e sempre que vier snapshot novo, atualiza o último estável se houver leitura estável.
  useEffect(() => {
    if (!snapshot?.actuators) return;

    setLastStable((prev) => {
      const next: Record<number, Stable> = { ...prev };

      // Garante chaves presentes (default RECUADO caso ainda não haja histórico)
      snapshot.actuators.forEach((a: any) => {
        if (next[a.id] == null) next[a.id] = "RECUADO";
      });

      // Atualiza somente quando o estado atual for estável
      snapshot.actuators.forEach((a: any) => {
        const st = computeStable(a);
        if (st) next[a.id] = st;
      });

      return next;
    });
  }, [snapshot]);

  // Soma de CPM total
  const totalCpm = useMemo(
    () => (snapshot?.actuators ?? []).reduce((acc: number, a: any) => acc + (a.cpm || 0), 0),
    [snapshot]
  );

  if (!snapshot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Live Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Aguardando dados do backend...
          </p>
        </CardContent>
      </Card>
    );
  }

  // Função que exibe apenas AVANÇADO/RECUADO (nunca "TRANSIÇÃO"):
  // se a leitura atual não for estável, cai para o último estado estável conhecido.
  const getDisplayState = (a: any): Stable => {
    const st = computeStable(a);
    return st ?? lastStable[a.id] ?? "RECUADO";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Metrics</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Status do sistema */}
        <div>
          <p className="text-sm text-muted-foreground">System</p>
          <p className="text-lg font-bold">
            {snapshot.system.status.toUpperCase()}
          </p>
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
            {(snapshot.actuators ?? []).map((a: any) => (
              <li key={a.id}>
                AT{a.id}: {getDisplayState(a)} — {a.cpm ?? 0} CPM
              </li>
            ))}
          </ul>
        </div>

        {/* MPU opcional */}
        {snapshot.mpu && (
          <div className="sm:col-span-3">
            <p className="text-sm text-muted-foreground">MPU</p>
            <p className="text-xs">
              ax: {snapshot.mpu.ax.toFixed(2)} | ay: {snapshot.mpu.ay.toFixed(2)} | az:{" "}
              {snapshot.mpu.az.toFixed(2)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LiveMetrics;
