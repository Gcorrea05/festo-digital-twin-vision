// src/pages/alerts.tsx
import React, { useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAlerts } from "@/hooks/useAlerts";
import type { AlertItem } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// --- utils visuais (sem mexer no tema global) ---
function severityLabel(n: number) {
  const clamped = Math.max(1, Math.min(5, Number(n) || 1));
  return ["Info", "Baixa", "Média", "Alta", "Crítica"][clamped - 1];
}
function severityPillClasses(n: number) {
  const base = "px-2 py-0.5 rounded-full text-xs font-medium";
  const s = Math.max(1, Math.min(5, Number(n) || 1));
  switch (s) {
    case 1: return `${base} bg-slate-200 text-slate-900`;
    case 2: return `${base} bg-emerald-200 text-emerald-900`;
    case 3: return `${base} bg-amber-200 text-amber-900`;
    case 4: return `${base} bg-orange-200 text-orange-900`;
    case 5: return `${base} bg-red-200 text-red-900`;
    default: return `${base} bg-slate-200 text-slate-900`;
  }
}
function timeSince(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

const REFRESH_MS = 8000;

const AlertsPage: React.FC = () => {
  const [auto, setAuto] = useState(true);
  const [selected, setSelected] = useState<AlertItem | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);

  const onNewAlert = useCallback((a: AlertItem) => {
    // abre popup automático somente se não estiver aberto
    if (!popupOpen) {
      setSelected(a);
      setPopupOpen(true);
    }
  }, [popupOpen]);

  const { items, loading, error, refresh } = useAlerts({
    pollMs: REFRESH_MS,
    limit: 5,
    onNewAlert: auto ? onNewAlert : undefined,
  });

  const headerRight = useMemo(() => (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setAuto(v => !v)}
        className={`h-9 rounded-md px-3 text-sm border ${
          auto
            ? "border-emerald-700 bg-emerald-900/20 text-emerald-300"
            : "border-zinc-700 bg-zinc-900 text-zinc-300"
        }`}
        title={`Auto refresh a cada ${Math.floor(REFRESH_MS/1000)}s`}
      >
        Auto-refresh: {auto ? "ON" : "OFF"}
      </button>
      <button
        onClick={refresh}
        className="h-9 rounded-md px-3 text-sm border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
      >
        {loading ? "Atualizando…" : "Atualizar"}
      </button>
    </div>
  ), [auto, loading, refresh]);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-8 pb-12">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">Alerts</h1>
            <p className="mt-1 text-sm md:text-base text-muted-foreground">
              Últimos 5 alertas do sistema (tempo real).
            </p>
          </div>
          {headerRight}
        </header>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl font-bold">Últimos alertas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="py-2 text-left font-semibold">Quando</th>
                    <th className="py-2 text-left font-semibold">Sev.</th>
                    <th className="py-2 text-left font-semibold">Status</th>
                    <th className="py-2 text-left font-semibold">Código</th>
                    <th className="py-2 text-left font-semibold">Mensagem</th>
                    <th className="py-2 text-left font-semibold">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-zinc-400">
                        Sem alertas recentes.
                      </td>
                    </tr>
                  )}

                  {items.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-zinc-900 hover:bg-zinc-900/40 cursor-pointer"
                      onClick={() => { setSelected(a); setPopupOpen(true); }}
                    >
                      <td className="py-2 align-top">
                        <div className="text-zinc-200">{timeSince(a.created_at)} ago</div>
                        <div className="text-xs text-zinc-500">{new Date(a.created_at).toLocaleString()}</div>
                      </td>
                      <td className="py-2 align-top">
                        <span className={severityPillClasses(a.severity)}>{severityLabel(a.severity)}</span>
                      </td>
                      <td className="py-2 align-top">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-200 ring-1 ring-zinc-600/40">
                          {a.status ?? "open"}
                        </span>
                      </td>
                      <td className="py-2 align-top">
                        <span className="font-mono text-xs text-zinc-300">{a.code}</span>
                      </td>
                      <td className="py-2 align-top text-zinc-200">{a.message}</td>
                      <td className="py-2 align-top text-zinc-400">
                        {a.origin ?? (a.actuator_id != null ? `A${a.actuator_id}` : "-")}
                      </td>
                    </tr>
                  ))}

                  {loading && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-zinc-400">
                        Carregando…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="mt-2 rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
                {error}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Popup de detalhes / recomendações / causas */}
      <Dialog open={popupOpen} onOpenChange={setPopupOpen}>
        <DialogContent className="sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className={severityPillClasses(selected.severity)}>{severityLabel(selected.severity)}</span>
                  <span className="font-mono text-sm">{selected.code}</span>
                </DialogTitle>
                <DialogDescription className="pt-1">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{selected.message}</span>
                    {selected.origin ? <span className="ml-2 opacity-80">• Origem: {selected.origin}</span> : null}
                    <span className="ml-2 opacity-60">{new Date(selected.created_at).toLocaleString()}</span>
                  </div>
                </DialogDescription>
              </DialogHeader>

              {selected.causes?.length ? (
                <div className="mt-2">
                  <div className="text-sm font-semibold mb-1">Possíveis causas</div>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {selected.causes.map((c, i) => <li key={`c-${i}`}>{c}</li>)}
                  </ul>
                </div>
              ) : null}

              {selected.recommendations?.length ? (
                <div className="mt-4">
                  <div className="text-sm font-semibold mb-1">O que fazer agora</div>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {selected.recommendations.map((r, i) => <li key={`r-${i}`}>{r}</li>)}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default AlertsPage;
