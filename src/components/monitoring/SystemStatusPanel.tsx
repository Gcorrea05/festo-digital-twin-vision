// src/components/monitoring/SystemStatusPanel.tsx
import React, { useMemo } from "react";
import { useLive } from "@/context/LiveContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";

type Sev = "operational" | "down" | "unknown";

/* ================= UI helpers ================= */
function pill(sev: Sev) {
  const base =
    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xl font-extrabold tracking-wide";
  switch (sev) {
    case "operational":
      return {
        cls: `${base} bg-emerald-900/30 text-emerald-300 ring-1 ring-emerald-500/30`,
        icon: <CheckCircle2 className="h-5 w-5" />,
        label: "Online",
      };
    case "down":
      return {
        cls: `${base} bg-red-900/30 text-red-300 ring-1 ring-red-500/30`,
        icon: <XCircle className="h-5 w-5" />,
        label: "Offline",
      };
    default:
      return {
        cls: `${base} bg-zinc-800 text-zinc-200 ring-1 ring-zinc-600/40`,
        icon: <HelpCircle className="h-5 w-5" />,
        label: "Unknown",
      };
  }
}

/* ================= Freshness model =================
   Derivamos saúde pelo frescor do pacote "live":
   - ts <= 2s: operational
   - ts <= 10s: unknown (degraded)
   - >10s     : down
*/
const OK_MS = 2000;
const DEG_MS = 10000;

function sevFromTs(ts?: string | null, nowMs = Date.now()): Sev {
  if (!ts) return "unknown";
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return "unknown";
  const age = nowMs - t;
  if (age <= OK_MS) return "operational";
  if (age <= DEG_MS) return "unknown";
  return "down";
}

const SystemStatusPanel: React.FC = () => {
  const { snapshot } = useLive();
  const now = Date.now();

  // Overall: só pelo frescor do pacote "live"
  const overall = useMemo<Sev>(() => sevFromTs(snapshot?.ts, now), [snapshot?.ts, now]);

  // Actuators: precisa ter lista e o pacote estar fresco
  const actuatorsSev: Sev = useMemo(() => {
    const hasData = (snapshot?.actuators || []).length > 0;
    if (!hasData) return "down";
    return sevFromTs(snapshot?.ts, now);
  }, [snapshot?.actuators, snapshot?.ts, now]);

  // Sensors: usamos MPUs como proxy (se vier RMS, há ingestão de sensores)
  const sensorsSev: Sev = useMemo(() => {
    const hasMPU = (snapshot?.mpu || []).length > 0;
    if (!hasMPU) return "down";
    return sevFromTs(snapshot?.ts, now);
  }, [snapshot?.mpu, snapshot?.ts, now]);

  // Transmission: se o pacote chega fresco, o WS está ok
  const transmissionSev: Sev = useMemo(() => sevFromTs(snapshot?.ts, now), [snapshot?.ts, now]);

  const Row = ({ label, sev }: { label: string; sev: Sev }) => {
    const p = pill(sev);
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="text-base md:text-lg text-zinc-300 font-semibold tracking-wide">
          {label}
        </div>
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
        <CardTitle>System Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="text-base md:text-lg font-semibold text-zinc-200 tracking-wide">
            Overall Status
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center">
            <div />
            <span className={overallPill.cls}>
              {overallPill.icon}
              {overallPill.label}
            </span>
          </div>
          {snapshot?.ts && (
            <div className="text-xs text-zinc-400 mt-1">
              last: {new Date(snapshot.ts).toLocaleTimeString()}
            </div>
          )}
        </div>

        <div className="space-y-4 pt-2">
          <div className="text-base md:text-lg font-semibold text-zinc-200 tracking-wide">
            Components
          </div>
          <div className="space-y-4">
            <Row label="Actuators" sev={actuatorsSev} />
            <Row label="Sensors" sev={sensorsSev} />
            <Row label="Transmission" sev={transmissionSev} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SystemStatusPanel;
