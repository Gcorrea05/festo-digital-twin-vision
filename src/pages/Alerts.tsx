// src/pages/alerts.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import AlertsConfigSheet from "@/components/AlertsConfigSheet";
import type { AlertItem } from "@/lib/api";

/* =========================
   Utils de apresentação
   ========================= */
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function severityLabel(n: number) {
  const clamped = clamp(Number(n) || 1, 1, 5);
  return ["Info", "Baixa", "Média", "Alta", "Crítica"][clamped - 1];
}

function severityPillClasses(n: number) {
  const base = "px-2 py-0.5 rounded-full text-xs font-medium";
  const s = clamp(Number(n) || 1, 1, 5);
  switch (s) {
    case 1: return `${base} bg-slate-200 text-slate-900`;
    case 2: return `${base} bg-emerald-200 text-emerald-900`;
    case 3: return `${base} bg-amber-200 text-amber-900`;
    case 4: return `${base} bg-orange-200 text-orange-900`;
    case 5: return `${base} bg-red-200 text-red-900`;
    default: return `${base} bg-slate-200 text-slate-900`;
  }
}

function statusPill(s?: string) {
  const base = "px-2 py-0.5 rounded-full text-xs font-medium ring-1";
  const st = (s ?? "open").toLowerCase();
  if (st === "ack") return `${base} bg-blue-100 text-blue-900 ring-blue-300/60`;
  if (st === "closed") return `${base} bg-slate-200 text-slate-900 ring-slate-400/60`;
  return `${base} bg-zinc-800 text-zinc-200 ring-zinc-600/40`;
}

function timeSince(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

const dtf = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" });

/* =========================
   Tipos vindos do backend
   ========================= */
type WSAlert = {
  type: "alert";
  ts: string;
  code: string;
  severity: number;
  origin?: string;
  message: string;
};
type HTTPAlertsSnapshot = { items: WSAlert[]; ts: string };

const toAlertItem = (a: WSAlert, idx?: number): AlertItem => ({
  id: `${a.code}-${a.ts}${idx != null ? `-${idx}` : ""}`,
  code: a.code,
  severity: a.severity,
  message: a.message,
  origin: a.origin,
  created_at: a.ts,
  status: "open",
});

/* =========================
   Tabela
   ========================= */
const SeverityPill = React.memo(({ sev }: { sev: number }) => (
  <span className={severityPillClasses(sev)}>{severityLabel(sev)}</span>
));
SeverityPill.displayName = "SeverityPill";

const AlertRow = React.memo(function AlertRow({
  a,
  onClick,
}: {
  a: AlertItem;
  onClick: (a: AlertItem) => void;
}) {
  return (
    <tr
      className="border-b border-zinc-900 hover:bg-zinc-900/40 cursor-pointer"
      onClick={() => onClick(a)}
    >
      <td className="py-2 align-top">
        <div className="text-zinc-200">{timeSince(a.created_at)} ago</div>
        <div className="text-xs text-zinc-500">{dtf.format(new Date(a.created_at))}</div>
      </td>
      <td className="py-2 align-top">
        <SeverityPill sev={a.severity} />
      </td>
      <td className="py-2 align-top">
        <span className={statusPill(a.status)}>{a.status ?? "open"}</span>
      </td>
      <td className="py-2 align-top">
        <span className="font-mono text-xs text-zinc-300">{a.code}</span>
      </td>
      <td className="py-2 align-top text-zinc-200">{a.message}</td>
      <td className="py-2 align-top text-zinc-400">
        {a.origin ?? (a.actuator_id != null ? `A${a.actuator_id}` : "—")}
      </td>
    </tr>
  );
});

function AlertsTable({
  items,
  loading,
  error,
  onRowClick,
}: {
  items: AlertItem[];
  loading: boolean;
  error?: string;
  onRowClick: (a: AlertItem) => void;
}) {
  const rows = useMemo(
    () => items.map((a) => <AlertRow key={String(a.id)} a={a} onClick={onRowClick} />),
    [items, onRowClick]
  );

  return (
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
              {!items.length && !loading && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-zinc-400">
                    Sem alertas recentes.
                  </td>
                </tr>
              )}

              {rows}

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
  );
}

/* =========================
   Página (1 snapshot HTTP + WS)
   ========================= */
const AlertsPage: React.FC = () => {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [selected, setSelected] = useState<AlertItem | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);

  // abre popup apenas quando o alerta do topo realmente muda
  const lastTopSigRef = useRef<string | null>(null);

  const onRowClick = useCallback((a: AlertItem) => {
    setSelected(a);
    setPopupOpen(true);
  }, []);

  // 1) snapshot inicial — única chamada HTTP
  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const res = await fetch("/api/alerts?limit=5", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const snap: HTTPAlertsSnapshot = await res.json();
        if (canceled) return;
        const normalized = (snap.items || []).map((it, idx) => toAlertItem(it, idx));
        setItems(normalized);
      } catch (e: any) {
        setError(e?.message ?? "Falha ao obter snapshot de alerts");
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  // 2) WebSocket para novos alerts (canal /ws/slow)
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let tries = 0;

    const { protocol, host } = window.location;
    const wsProto = protocol === "https:" ? "wss:" : "ws:";
    const url = `${wsProto}//${host}/ws/slow`;

    const connect = () => {
      ws = new WebSocket(url);

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.type !== "alert") return;

          const incoming = toAlertItem(data as WSAlert);

          setItems((prev) => {
            const next = [incoming, ...prev.filter((p) => p.id !== incoming.id)].slice(0, 5);

            // auto-popup se topo mudou e não há popup aberto
            const nextTop = next[0];
            const sig = nextTop ? `${nextTop.code}|${nextTop.origin}|${nextTop.created_at}` : null;

            // FIX TS: só chama setSelected se existe um AlertItem
            if (nextTop && sig && sig !== lastTopSigRef.current && !popupOpen) {
              setSelected(nextTop);
              setPopupOpen(true);
            }
            lastTopSigRef.current = sig;

            return next;
          });
        } catch {
          // ignora mensagens de heartbeat/erros de parse
        }
      };

      ws.onclose = () => {
        const delay = Math.min(15000, 1000 * Math.pow(2, Math.min(tries++, 4)));
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      ws = null;
    };
  }, [popupOpen]);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-8 pb-12">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">Alerts</h1>
            <p className="mt-1 text-sm md:text-base text-muted-foreground">
              Últimos 5 alertas do sistema.
            </p>
          </div>
          <AlertsConfigSheet />
        </header>

        <AlertsTable items={items} loading={loading} error={error} onRowClick={onRowClick} />
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
                    <span className="ml-2 opacity-60">{dtf.format(new Date(selected.created_at))}</span>
                  </div>
                </DialogDescription>
              </DialogHeader>

              {!!selected.causes?.length && (
                <div className="mt-2">
                  <div className="text-sm font-semibold mb-1">Possíveis causas</div>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {selected.causes.map((c, i) => (
                      <li key={`c-${i}`}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!!selected.recommendations?.length && (
                <div className="mt-4">
                  <div className="text-sm font-semibold mb-1">O que fazer agora</div>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {selected.recommendations.map((r, i) => (
                      <li key={`r-${i}`}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default AlertsPage;
