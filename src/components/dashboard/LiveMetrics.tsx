import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLive } from "@/context/LiveContext";
import { useActuatorSelection } from "@/context/ActuatorSelectionContext";

type StableAscii = "AVANCADO" | "RECUADO";
type StableUtf = "AVANÇADO" | "RECUADO";

/* ---------------- Helpers de compat ---------------- */

function normAscii(s?: string | null): StableAscii | null {
  if (!s) return null;
  const x = s.replace("Ç", "C");
  if (x === "AVANCADO") return "AVANCADO";
  if (x === "RECUADO") return "RECUADO";
  return null;
}

function pickTsISO(snapshot: any): string | null {
  if (!snapshot) return null;
  // formato legado
  if (typeof snapshot.ts === "string") return snapshot.ts;
  // formato novo
  if (typeof snapshot.ts_ms === "number") {
    return new Date(snapshot.ts_ms).toISOString();
  }
  return null;
}

function pickActuatorStateAscii(snapshot: any, id: 1 | 2): StableAscii | null {
  if (!snapshot) return null;

  // --- formato legado: { actuators: [{id, state}, ...] }
  const arr = snapshot.actuators as Array<any> | undefined;
  if (Array.isArray(arr) && arr.length) {
    const found =
      arr.find((a) => a?.id === id) ??
      arr.find((a) => a?.actuator_id === id) ??
      arr[id - 1];
    const s = normAscii(found?.state ?? null);
    if (s) return s;
  }

  // --- formato novo: { a1: {state_ascii/state/raw_state}, a2: {...} }
  const block = id === 1 ? snapshot.a1 : snapshot.a2;
  const sNew =
    normAscii(block?.state_ascii ?? null) ||
    normAscii(block?.state ?? null) ||
    normAscii(block?.raw_state ?? null);
  if (sNew) return sNew;

  return null;
}

/* ---------------- Componente ---------------- */

const LiveMetrics: React.FC = () => {
  const { snapshot } = useLive();
  const { selectedId } = useActuatorSelection(); // 1 | 2
  const shownId: 1 | 2 = (selectedId as 1 | 2) ?? 1;

  // Timestamp (ISO) compatível com ambos formatos
  const tsISO = useMemo(() => pickTsISO(snapshot), [snapshot]);

  // Saúde do sistema pelo atraso do snapshot
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "—">(() => {
    if (!tsISO) return "—";
    const t = Date.parse(tsISO);
    if (Number.isNaN(t)) return "—";
    const ageMs = Date.now() - t;
    if (ageMs <= 2000) return "OK";
    if (ageMs <= 10000) return "DEGRADED";
    return "OFFLINE";
  }, [tsISO]);

  // Estado do atuador selecionado (normalizado para ASCII)
  const st = useMemo<StableAscii | null>(() => {
    return pickActuatorStateAscii(snapshot, shownId);
  }, [snapshot, shownId]);

  // Rótulo mostrado no badge (mantém seus textos)
  const label: "ABERTO" | "RECUADO" | "—" =
    st === "AVANCADO" ? "ABERTO" : st === "RECUADO" ? "RECUADO" : "—";

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
            {tsISO && (
              <div className="text-xs text-slate-400 mt-1">
              </div>
            )}
          </div>
        </div>

        {/* Atuador selecionado */}
        <div className="pt-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-16 text-base md:text-lg font-bold">AT{shownId}:</div>
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
