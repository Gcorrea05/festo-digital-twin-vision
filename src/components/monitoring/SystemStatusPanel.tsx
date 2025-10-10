// src/components/monitoring/SystemStatusPanel.tsx
import React, { useMemo } from "react";
import { useLive } from "@/context/LiveContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";

type Sev = "operational" | "down" | "unknown";

// ===== UI helpers =====
function pill(sev: Sev) {
  const base =
    "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium";
  switch (sev) {
    case "operational":
      return {
        cls: `${base} bg-emerald-900/30 text-emerald-300 ring-1 ring-emerald-500/30`,
        icon: <CheckCircle2 className="h-4 w-4" />,
        label: "Online",
      };
    case "down":
      return {
        cls: `${base} bg-red-900/30 text-red-300 ring-1 ring-red-500/30`,
        icon: <XCircle className="h-4 w-4" />,
        label: "Offline",
      };
    default:
      return {
        cls: `${base} bg-zinc-800 text-zinc-200 ring-1 ring-zinc-600/40`,
        icon: <HelpCircle className="h-4 w-4" />,
        label: "Unknown",
      };
  }
}

// ===== Freshness =====
const FRESH_MS = 5000; // 5s para considerar "online"

function isFresh(ts?: string | number, now = Date.now(), freshMs = FRESH_MS) {
  if (!ts) return false;
  const t = typeof ts === "string" ? Date.parse(ts) : ts;
  return Number.isFinite(t) && now - t <= freshMs;
}

const SystemStatusPanel: React.FC = () => {
  const { snapshot } = useLive();
  const now = Date.now();

  // Overall (mapeia "ok" | "degraded" | "offline" para UI)
  const overall = useMemo<Sev>(() => {
    const s = String(snapshot?.system?.status ?? "unknown").toLowerCase();
    if (s === "ok") return "operational";
    if (s === "offline" || s === "down") return "down";
    return "unknown";
  }, [snapshot?.system?.status]);

  // Actuators: se qualquer atuador tiver ts recente
  const actuatorsSev: Sev = useMemo(() => {
    const arr = snapshot?.actuators ?? [];
    if (!arr.length) return "down";
    const anyFresh = arr.some((a) => isFresh(a.ts, now));
    return anyFresh ? "operational" : "down";
  }, [snapshot?.actuators, now]);

  // Sensors/Transmission: espelham atividade dos atuadores (mesmo canal WS)
  const sensorsSev: Sev = actuatorsSev;
  const transmissionSev: Sev = actuatorsSev;

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
            <Row label="Actuators" sev={actuatorsSev} />
            <Row label="Sensors" sev={sensorsSev} />
            <Row label="Transmission" sev={transmissionSev} />
            {/* Control removido */}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SystemStatusPanel;
