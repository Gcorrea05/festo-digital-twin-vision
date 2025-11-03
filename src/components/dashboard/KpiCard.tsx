// src/components/dashboard/LiveMetricsCard.tsx
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLive } from "@/context/LiveContext";

/** Converte flags estáveis em rótulo simples */
function stateFromFlags(recuado?: unknown, avancado?: unknown): "ABERTO" | "RECUADO" | "—" {
  const r = recuado === 1 || recuado === true;
  const a = avancado === 1 || avancado === true;
  if (r && !a) return "RECUADO";
  if (a && !r) return "ABERTO";
  return "—";
}

/** Deduz rótulo exibido a partir do objeto do atuador (compat com shapes legados) */
function labelFromActuator(a: any): "ABERTO" | "RECUADO" | "—" {
  // 1) preferir campo textual `state` quando houver
  const st = String(a?.state ?? "").toUpperCase();
  if (st.includes("RECU")) return "RECUADO";
  if (st.includes("AVAN")) return "ABERTO";

  // 2) fallback para flags (recuado/avancado) se existirem
  return stateFromFlags(a?.recuado, a?.avancado);
}

/** Formata ms => "Xd HH:MM:SS" ou "HH:MM:SS" (aqui usamos só se um dia vier runtime de sistema) */
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

export default function LiveMetricsCard() {
  const { snapshot } = useLive(); // tipo: { ts: string|null; actuators: LiveActuator[]; mpu: LiveMPU[]; }

  // Exibimos os atuadores que vierem no snapshot (sem depender de selectedActuator)
  const rows = useMemo(() => {
    const list = Array.isArray(snapshot?.actuators) ? snapshot!.actuators : [];
    return list
      .filter((a: any) => a && (a.id === 1 || a.id === 2))
      .map((a: any) => ({
        id: a.id as 1 | 2,
        state: labelFromActuator(a),
      }));
  }, [snapshot?.actuators]);

  // Como o shape atual não expõe `system`, mostramos "—"
  const systemText = "—";
  const runtimeText = "—"; // se futuramente vier runtime_ms, basta trocar por formatDuration(runtime_ms)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Live Metrics (último valor gravado)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-muted-foreground">System</div>
          <div className="font-medium">{systemText}</div>

          <div className="text-muted-foreground">Runtime</div>
          <div className="font-medium">{runtimeText}</div>
        </div>

        <div className="pt-2">
          <div className="text-sm text-muted-foreground mb-2">Actuators</div>
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <div className="w-12 text-xs font-semibold">AT{r.id}:</div>
                <Badge variant="secondary" className="uppercase">
                  {r.state}
                </Badge>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="text-xs text-muted-foreground">Nenhum atuador disponível.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
