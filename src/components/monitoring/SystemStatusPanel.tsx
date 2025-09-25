// src/components/monitoring/SystemStatusPanel.tsx
import React, { useMemo } from "react";
import { useLive } from "@/context/LiveContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";

type Sev = "operational" | "warning" | "down" | "unknown";

const SEV_ORDER: Record<Sev, number> = {
  operational: 0,
  warning: 1,
  down: 2,
  unknown: 3,
};

function pill(sev: Sev) {
  const base =
    "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium";
  switch (sev) {
    case "operational":
      return {
        cls: `${base} bg-emerald-900/30 text-emerald-300 ring-1 ring-emerald-500/30`,
        icon: <CheckCircle2 className="h-4 w-4" />,
        label: "Operational",
      };
    case "warning":
      return {
        cls: `${base} bg-amber-900/30 text-amber-300 ring-1 ring-amber-500/30`,
        icon: <AlertTriangle className="h-4 w-4" />,
        label: "Warning",
      };
    case "down":
      return {
        cls: `${base} bg-red-900/30 text-red-300 ring-1 ring-red-500/30`,
        icon: <XCircle className="h-4 w-4" />,
        label: "Down",
      };
    default:
      return {
        cls: `${base} bg-zinc-800 text-zinc-200 ring-1 ring-zinc-600/40`,
        icon: <HelpCircle className="h-4 w-4" />,
        label: "Unknown",
      };
  }
}

function normalizeSev(v: unknown): Sev {
  if (typeof v === "boolean") return v ? "operational" : "down";
  if (typeof v === "number") {
    if (v <= 0) return "down";
    if (v === 1) return "operational";
    return "warning";
  }
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (["operational", "ok", "up", "online", "running"].includes(s)) return "operational";
  if (["warning", "warn", "degraded", "maintenance", "partial"].includes(s)) return "warning";
  if (["down", "offline", "error", "critical", "stopped", "desligado"].includes(s)) return "down";
  return "unknown";
}

export default function SystemStatusPanel() {
  const { snapshot } = useLive();

  // overall básico (ok/degraded/down/unknown) — útil como fallback
  const overallFromStatus = useMemo<Sev>(() => {
    const s = String(snapshot?.system.status ?? "unknown").toLowerCase();
    if (s === "ok") return "operational";
    if (s === "degraded") return "warning";
    if (s === "down" || s === "offline") return "down";
    return "unknown";
  }, [snapshot?.system.status]);

  // componentes vindos do backend via LiveContext (se ausentes, ficam unknown)
  const components = useMemo(() => {
    const c = snapshot?.system.components ?? {};
    return {
      actuators: normalizeSev((c as any).actuators),
      sensors: normalizeSev((c as any).sensors),
      transmission: normalizeSev((c as any).transmission),
      control: normalizeSev((c as any).control),
    } as const;
  }, [snapshot?.system.components]);

  // overall real = pior severidade entre os componentes; se não houver, usa overallFromStatus
  const overall: Sev = useMemo(() => {
    const arr = Object.values(components);
    const hasAny =
      arr.some((v) => v !== "unknown") ||
      Object.keys(snapshot?.system.components ?? {}).length > 0;
    if (!hasAny) return overallFromStatus;
    return arr.reduce<Sev>(
      (acc, cur) => (SEV_ORDER[cur] > SEV_ORDER[acc] ? cur : acc),
      "operational"
    );
  }, [components, overallFromStatus, snapshot?.system.components]);

  const Row = ({ label, sev }: { label: string; sev: Sev }) => {
    const p = pill(sev);
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="text-sm md:text-base text-zinc-300">{label}</div>
        <span className={p.cls}>
          {p.icon}
          {p.label}
        </span>
      </div>
    );
  };

  const overallPill = pill(overall);

  const ROWS: Array<{ label: string; sev: Sev }> = [
    { label: "Actuators", sev: components.actuators },
    { label: "Sensors", sev: components.sensors },
    { label: "Transmission", sev: components.transmission },
    { label: "Control", sev: components.control }, // renomeado pra ficar consistente
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-2xl md:text-3xl font-bold">System Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-sm md:text-base font-semibold text-zinc-200">
            Overall Status:
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center">
            <div />
            <span className={overallPill.cls}>
              {overallPill.icon}
              {overallPill.label}
            </span>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div className="text-sm md:text-base font-semibold text-zinc-200">
            Components:
          </div>
          <div className="space-y-3">
            {ROWS.map((r) => (
              <Row key={r.label} label={r.label} sev={r.sev} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
