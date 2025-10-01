// src/components/monitoring/LiveMetricsMon.tsx
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";
import useLatchedDisplay from "../../hooks/useLatchedDisplay";
import { useActuatorTimings } from "../../hooks/useActuatorTimings";

type Props = { selectedId: 1 | 2 };

const fmtMs = (v?: number | null) =>
  v == null || !Number.isFinite(Number(v)) ? "—" : `${v} ms`;

const LiveMetricsMon: React.FC<Props> = ({ selectedId }) => {
  const { snapshot } = useLive();
  const { timingsById, loading: tLoading } = useActuatorTimings(2000);

  const a =
    (snapshot?.actuators ?? []).find((x: any) => Number(x.id) === Number(selectedId)) ??
    null;

  // ⬇️ histerese/hysteresis aqui
  const { label: displayState, facets } = useLatchedDisplay(a, selectedId);

  // tempos do último ciclo
  const t = timingsById[selectedId];

  // CPM / ciclos se vierem no snapshot
  const cpm = Number((a as any)?.cpm ?? 0) || 0;
  const cycles = Number((a as any)?.totalCycles ?? (a as any)?.cycles ?? 0) || 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Live • Atuador A{selectedId}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Linha 1 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Estado</div>
            <div className="text-lg font-semibold uppercase">{displayState}</div>
            {facets && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                S1={facets.S1} • S2={facets.S2}
              </div>
            )}
          </div>

          <div>
            <div className="text-xs text-muted-foreground">CPM</div>
            <div className="text-lg font-semibold">{cpm}</div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">Ciclos</div>
            <div className="text-lg font-semibold">{cycles}</div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">Última leitura</div>
            <div className="text-sm">
              {t?.ts ? new Date(t.ts).toLocaleTimeString() : "—"}
              {tLoading ? (
                <span className="ml-2 text-xs opacity-60">atualizando…</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Linha 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-md border px-3 py-2">
            <div className="text-xs text-muted-foreground">Abertura</div>
            <div className="text-lg font-semibold">{fmtMs(t?.open_ms)}</div>
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-xs text-muted-foreground">Fechamento</div>
            <div className="text-lg font-semibold">{fmtMs(t?.close_ms)}</div>
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-xs text-muted-foreground">Ciclo</div>
            <div className="text-lg font-semibold">{fmtMs(t?.cycle_ms)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveMetricsMon;
