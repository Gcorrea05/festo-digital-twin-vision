// src/components/dashboard/StatusOverview.tsx
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, AlertCircle, AlertTriangle } from "lucide-react";
import KpiCard, { type Severity } from "./KpiCard";
import { useLive } from "@/context/LiveContext";

const StatusOverview = () => {
  const { snapshot } = useLive();

  // Deriva sistema
  const statusSistema: "Online" | "Offline" | "…" = !snapshot
    ? "…"
    : snapshot.system.status === "ok"
    ? "Online"
    : "Offline";

  // Deriva KPIs do AT1
  const a1 = snapshot?.actuators?.find((a) => a.id === 1) ?? null;

  const estadoAtualA1 = useMemo(() => {
    if (!a1) return snapshot ? "DESCONHECIDO" : "...";
    return a1.facets.S2 === 1 ? "AVANÇADO" : a1.facets.S1 === 1 ? "RECUADO" : "TRANSIÇÃO";
  }, [a1, snapshot]);

  const cpm = a1?.cpm ?? 0;

  // Tempo desde último ts do AT1
  const tempoAtividade = useMemo(() => {
    if (!a1?.ts) return "--";
    const diff = Math.max(0, Date.now() - new Date(a1.ts).getTime());
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  }, [a1?.ts]);

  // Severities
  const kpiSeverities: {
    estado: Severity; sistema: Severity; cpm: Severity; uptime: Severity;
  } = {
    estado: estadoAtualA1 === "AVANÇADO" || estadoAtualA1 === "RECUADO" ? "green" : "amber",
    sistema: statusSistema === "Online" ? "green" : statusSistema === "Offline" ? "red" : "gray",
    cpm: cpm >= 100 ? "green" : cpm >= 60 ? "amber" : "red",
    uptime: "gray",
  };

  // Card “System Status”
const systemStatus = {
  overall: statusSistema === "Online" ? "operational" : statusSistema === "Offline" ? "critical" : "warning",
  components: [
    { name: "Conveyor", status: "operational" },
    { name: "Sensors", status: "operational" },
    { name: "Actuators", status: "operational" },
    { name: "Control System", status: statusSistema === "Online" ? "operational" : "critical" },
  ] as Array<{ name: string; status: "operational" | "warning" | "critical" }>,
};


  const getStatusIcon = (status: string) => {
    switch (status) {
      case "operational": return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "warning": return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "critical": return <AlertCircle className="h-5 w-5 text-red-500" />;
      default: return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
  };
  const getStatusClass = (status: string) => {
    switch (status) {
      case "operational": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500";
      case "warning": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500";
      case "critical": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500";
      default: return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500";
    }
  };

  return (
    <div className="space-y-8">
      {/* KPIs topo */}
      <div className="flex flex-wrap gap-8">
        <div className="basis-[260px] grow">
          <KpiCard title="ESTADO ATUAL (A1)" value={estadoAtualA1} severity={kpiSeverities.estado} />
        </div>
        <div className="basis-[260px] grow">
          <KpiCard title="STATUS DO SISTEMA" value={statusSistema} severity={kpiSeverities.sistema} />
        </div>
        <div className="basis-[260px] grow">
          <KpiCard title="CPM" value={cpm} unit="ciclos/min" severity={kpiSeverities.cpm} decimals={0} />
        </div>
        <div className="basis-[260px] grow">
          <KpiCard title="TEMPO DESDE ÚLTIMO EVENTO (A1)" value={tempoAtividade} severity={kpiSeverities.uptime} />
        </div>
      </div>

      {/* System Status */}
      <Card className="col-span-12 md:col-span-4">
        <CardHeader><CardTitle>System Status</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Overall Status:</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusClass(systemStatus.overall)}`}>
                {getStatusIcon(systemStatus.overall)}
                {systemStatus.overall.charAt(0).toUpperCase() + systemStatus.overall.slice(1)}
              </span>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Components:</h4>
              <ul className="ml-4 list-disc space-y-2">
                {systemStatus.components.map((c) => (
                  <li key={c.name} className="flex items-center justify-between">
                    <span className="text-sm">{c.name}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusClass(c.status)}`}>
                      {getStatusIcon(c.status)}
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {!snapshot && <div className="text-xs text-muted-foreground">carregando snapshot…</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StatusOverview;
