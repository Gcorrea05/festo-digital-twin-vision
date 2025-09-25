// src/components/dashboard/KpiCard.tsx
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type Severity = "green" | "amber" | "red" | "gray";

type Props = {
  title: string;
  value?: number | string | null;
  unit?: string;
  severity?: Severity;
  trend?: React.ReactNode;
  loading?: boolean;
  decimals?: number;
  className?: string;
};

function dotClass(sev: Severity = "gray") {
  const base = "inline-block h-2.5 w-2.5 rounded-full ring-2 ring-transparent";
  switch (sev) {
    case "green":
      return `${base} bg-emerald-500 dark:bg-emerald-400`;
    case "amber":
      return `${base} bg-amber-500 dark:bg-amber-400`;
    case "red":
      return `${base} bg-red-500 dark:bg-red-400`;
    default:
      return `${base} bg-zinc-400 dark:bg-zinc-500`;
  }
}

function formatValue(value?: number | string | null, decimals = 2): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    const fixed = value.toFixed(decimals);
    return parseFloat(fixed).toString();
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
  className = "",
}: Props) {
  const display = loading ? "…" : formatValue(value, decimals);
  const withUnit =
    display !== "—" && unit ? (
      <span className="text-zinc-400 dark:text-zinc-500 ml-1">{unit}</span>
    ) : null;

  return (
    <Card className={`h-full w-full min-w-0 ${className}`}>
      <CardHeader className="pb-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
          <CardTitle className="min-w-0 text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-300 leading-tight truncate">
            {title}
          </CardTitle>
          {/* Pontinho colorido (sem texto) */}
          <span className={dotClass(severity)} aria-label={severity} title={severity} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-end justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-base sm:text-lg md:text-2xl font-semibold tracking-tight truncate">
              {display}
              {withUnit}
            </div>
          </div>
          {trend ? (
            <div className="w-20 sm:w-28 h-10 sm:h-12 flex items-center justify-end shrink-0">
              {trend}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
