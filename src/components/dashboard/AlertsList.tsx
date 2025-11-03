// src/components/dashboard/AlertsList.tsx
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, AlertCircle, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAlerts } from "@/hooks/useAlerts";
import type { AlertItem } from "@/lib/api";

// Nosso backend usa severidade numérica (1..5). Vamos padronizar em 3 faixas.
type SevLabel = "info" | "warning" | "critical";

function sevToLabel(sev: unknown): SevLabel {
  const s = Number(sev ?? 0);
  if (s >= 4) return "critical";
  if (s >= 3) return "warning";
  return "info";
}

function getSeverityIcon(severity: unknown) {
  const label = sevToLabel(severity);
  switch (label) {
    case "warning":
      return <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />;
    case "critical":
      return <AlertCircle className="h-4 w-4 mr-2 text-red-500" />;
    case "info":
    default:
      return <Bell className="h-4 w-4 mr-2 text-blue-500" />;
  }
}

function timeAgo(isoOrDate: string | Date | null | undefined) {
  if (!isoOrDate) return "Just now";
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return "Just now";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "Just now";
}

const AlertsList: React.FC = () => {
  // busca real no backend (sem mock)
  const { items, loading, error } = useAlerts({ pollMs: 15000 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Alerts</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading && (
          <div className="p-4 text-sm text-muted-foreground">Loading alerts…</div>
        )}
        {error && !loading && (
          <div className="p-4 text-sm text-red-500">Error: {error}</div>
        )}
        {!loading && !error && (!items || items.length === 0) && (
          <div className="p-4 text-sm text-muted-foreground">No alerts.</div>
        )}

        {!loading && !error && items && items.length > 0 && (
          <ul className="divide-y divide-border">
            {items.map((alert: AlertItem) => {
              const label = sevToLabel((alert as any)?.severity);
              // backend expõe "ts" (ISO). "timestamp" não existe.
              const ts =
                (alert as any)?.ts ??
                (alert as any)?.created_at ??
                (alert as any)?.time ??
                null;

              return (
                <li key={String((alert as any)?.id ?? `${alert.code}-${ts}`)} className="flex items-center px-4 py-3">
                  {getSeverityIcon((alert as any)?.severity)}
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {(alert as any)?.message ?? (alert as any)?.code ?? "Alert"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {timeAgo(ts)}
                    </p>
                  </div>
                  <Badge variant={label === "critical" ? "destructive" : "secondary"}>
                    {label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default AlertsList;
