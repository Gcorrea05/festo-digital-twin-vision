import React, { useMemo } from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { useWsTap } from "@/hooks/useWsTap";

function fmt(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

const chColor: Record<string, string> = {
  live: "text-emerald-600",
  monitoring: "text-blue-600",
  slow: "text-amber-600",
};

export default function PayloadMonitor() {
  const items = useWsTap(200);

  const last = useMemo(() => items.slice(-50), [items]); // mostra os 50 últimos

  return (
    <Card className="h-[360px] overflow-hidden">
      <CardHeader>
        <CardTitle>Payloads em tempo real (50 últimos)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] overflow-auto font-mono text-xs space-y-1">
          {last.map((it, idx) => (
            <div key={idx} className="flex gap-2">
              <span className={`shrink-0 w-20 ${chColor[it.ch]}`}>[{it.ch}]</span>
              <span className="shrink-0 w-16 text-muted-foreground">{fmt(it.at)}</span>
              <pre className="whitespace-pre-wrap break-words">{JSON.stringify(it.msg)}</pre>
            </div>
          ))}
          {last.length === 0 && <div className="text-muted-foreground">Sem mensagens ainda…</div>}
        </div>
      </CardContent>
    </Card>
  );
}
