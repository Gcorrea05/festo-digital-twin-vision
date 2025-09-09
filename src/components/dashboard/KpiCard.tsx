// Card de KPI com semáforo e mini-trend embutível
// - Usa shadcn/ui Card
// - Exibe título, valor + unidade, badge de severidade e área para sparkline

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type Severity = "green" | "amber" | "red" | "gray";

type Props = {
  title: string;
  value?: number | string | null;
  unit?: string;
  severity?: Severity;
  // hint?: string; // removido da UI (sem subtitle)
  /**
   * Render prop para um gráfico pequenininho (sparkline).
   * Ex.: <MiniSparkline data={...} />
   */
  trend?: React.ReactNode;
  /**
   * Quando true, exibe estado de carregamento (placeholder).
   */
  loading?: boolean;
  /**
   * Decimais quando value é numérico.
   */
  decimals?: number;
};

function badgeClass(sev: Severity = "gray") {
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";
  switch (sev) {
    case "green":
      return `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300`;
    case "amber":
      return `${base} bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300`;
    case "red":
      return `${base} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300`;
    default:
      return `${base} bg-zinc-100 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300`;
  }
}

function formatValue(value?: number | string | null, decimals = 2): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    const fixed = value.toFixed(decimals);
    return parseFloat(fixed).toString(); // tira zeros à direita
  }
  return String(value);
}

export default function KpiCard({
  title,
  value = null,
  unit,
  severity = "gray",
  trend,
  loading = false,
  decimals = 2,
}: Props) {
  const display = loading ? "…" : formatValue(value, decimals);
  const withUnit =
    display !== "—" && unit ? (
      <span className="text-zinc-400 dark:text-zinc-500 ml-1">{unit}</span>
    ) : null;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            {title}
          </CardTitle>
          <span className={badgeClass(severity)}>{severity.toUpperCase()}</span>
        </div>
        {/* Subtitle/hint removido da UI */}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-end justify-between gap-4">
          <div className="flex-1">
            <div className="text-xl font-semibold tracking-tight">
              {display}
              {withUnit}
            </div>
          </div>
          {trend ? (
            <div className="w-28 h-12 flex items-center justify-end">{trend}</div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
