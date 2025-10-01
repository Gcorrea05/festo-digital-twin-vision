// src/components/alerts/AlertBadge.tsx
import React from "react";

export function severityLabel(sev: number) {
  const n = Math.max(1, Math.min(5, Number(sev) || 1));
  return ["Info","Baixa","Média","Alta","Crítica"][n - 1];
}

export function severityClasses(sev: number) {
  const n = Math.max(1, Math.min(5, Number(sev) || 1));
  // classes neutras Tailwind (não altera tema global)
  switch (n) {
    case 1: return "bg-slate-200 text-slate-900";
    case 2: return "bg-emerald-200 text-emerald-900";
    case 3: return "bg-amber-200 text-amber-900";
    case 4: return "bg-orange-200 text-orange-900";
    case 5: return "bg-red-200 text-red-900";
    default: return "bg-slate-200 text-slate-900";
  }
}

export const AlertBadge: React.FC<{ severity: number }> = ({ severity }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${severityClasses(severity)}`}>
    {severityLabel(severity)}
  </span>
);
