// src/components/dashboard/AlertsList.tsx
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, AlertCircle, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAlerts } from "@/hooks/useAlerts";
import type { AlertItem } from "@/lib/api";

function getSeverityIcon(severity: AlertItem["severity"]) {
  switch (severity) {
    case "warning":
      return <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />;
    case "critical":
      return <AlertCircle className="h-4 w-4 mr-2 text-red-500" />;
    case "info":
    default:
      return <Bell className="h-4 w-4 mr-2 text-blue-500" />;
  }
}

function timeAgo(timestamp: string) {
  const date = new Date(timestamp);
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
            {items.map((alert: AlertItem) => (
              <li key={alert.id} className="flex items-center px-4 py-3">
                {getSeverityIcon(alert.severity)}
                <div className="flex-1">
                  <p className="text-sm font-medium">{alert.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {timeAgo(alert.timestamp)}
                  </p>
                </div>
                <Badge variant="secondary">{alert.severity}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default AlertsList;
