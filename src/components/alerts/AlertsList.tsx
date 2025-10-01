// src/components/alerts/AlertsList.tsx
import React from "react";
import { AlertItem } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertBadge } from "./AlertBadge";

type Props = {
  items: AlertItem[];
  onClickItem?: (a: AlertItem) => void;
};

export const AlertsList: React.FC<Props> = ({ items, onClickItem }) => {
  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Últimos alertas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground">Sem alertas recentes.</div>
        )}
        {items.map((a) => (
          <button
            key={a.id}
            onClick={() => onClickItem?.(a)}
            className="w-full text-left rounded-lg border hover:bg-muted/40 px-3 py-2 transition"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertBadge severity={a.severity} />
                <span className="font-mono text-xs opacity-80">{a.code}</span>
                {a.origin ? <span className="text-xs opacity-60">• {a.origin}</span> : null}
              </div>
              <div className="text-xs opacity-60">{new Date(a.created_at).toLocaleTimeString()}</div>
            </div>
            <div className="text-sm mt-1">{a.message}</div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
};
