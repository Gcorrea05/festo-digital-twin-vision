// src/pages/Alerts.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import AlertsConfigSheet from "@/components/AlertsConfigSheet";
import type { AlertItem } from "@/lib/api";

/* =========================
   Utils de apresentação
   ========================= */
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Parse robusto para timestamps vindos do backend. */
function parseServerTs(input?: string | number | null): number | null {
  if (input == null) return null;

  // number?
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return input < 1e12 ? Math.round(input * 1000) : Math.round(input);
  }

  const s = String(input).trim();
  if (!s) return null;

  // number em string?
  if (/^\d{10,}$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return s.length <= 10 ? n * 1000 : n;
  }

  // ISO sem timezone: assume UTC
  const hasTz = /[zZ]|[+\-]\d{2}:\d{2}$/.test(s);
  const iso = hasTz ? s : `${s}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Exibe "x ago" e atualiza sozinho a cada 1s */
const Ago: React.FC<{ ts: string | number }> = ({ ts }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const t = parseServerTs(ts);
  if (t == null) return <>—</>;
  let diffMs = now - t;
  if (diffMs < 0) diffMs = 0;
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return <>{s}s ago</>;
  const m = Math.floor(s / 60);
  if (m < 60) return <>{m}m ago</>;
  const h = Math.floor(m / 60);
  if (h < 24) return <>{h}h {m % 60}m ago</>;
  const d = Math.floor(h / 24);
  return <>{d}d {h % 24}h ago</>;
};

function severityLabel(n: number) {
  const clamped = clamp(Number(n) || 1, 1, 5);
  return ["Info", "Baixa", "Média", "Alta", "Crítica"][clamped - 1];
}
function severityPillClasses(n: number) {
  const base = "px-2.5 py-1 rounded-full text-sm md:text-base font-semibold";
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
  const base = "px-2.5 py-1 rounded-full text-sm font-semibold ring-1";
  const st = (s ?? "open").toLowerCase();
  if (st === "ack") return `${base} bg-blue-100 text-blue-900 ring-blue-300/60`;
  if (st === "closed") return `${base} bg-slate-200 text-slate-900 ring-slate-400/60`;
  return `${base} bg-zinc-800 text-zinc-100 ring-zinc-600/40`;
}
const dtf = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" });

/* =========================
   Tipos vindos do backend (declara uma vez só)
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
  const abs = parseServerTs(a.created_at);
  return (
    <tr
      className="border-b border-zinc-900 hover:bg-zinc-900/50 cursor-pointer"
      onClick={() => onClick(a)}
    >
      <td className="py-3 align-top">
        <div className="text-slate-100 font-medium">
          {abs != null ? <Ago ts={abs} /> : "—"}
        </div>
        <div className="text-sm md:text-base text-slate-400">
          {abs != null ? dtf.format(new Date(abs)) : "—"}
        </div>
      </td>
      <td className="py-3 align-top">
        <SeverityPill sev={a.severity} />
      </td>
      <td className="py-3 align-top">
        <span className={statusPill(a.status)}>{a.status ?? "open"}</span>
      </td>
      <td className="py-3 align-top">
        <span className="font-mono text-base text-slate-200">{a.code}</span>
      </td>
      <td className="py-3 align-top text-slate-100 text-base">{a.message}</td>
      <td className="py-3 align-top text-slate-300 text-base">
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
        <CardTitle className="text-3xl font-extrabold">Últimos alertas</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-[16px] md:text-[17px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-200">
                <th className="py-3 text-left font-semibold">Quando</th>
                <th className="py-3 text-left font-semibold">Sev.</th>
                <th className="py-3 text-left font-semibold">Status</th>
                <th className="py-3 text-left font-semibold">Código</th>
                <th className="py-3 text-left font-semibold">Mensagem</th>
                <th className="py-3 text-left font-semibold">Origem</th>
              </tr>
            </thead>
            <tbody>
              {!items.length && !loading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-200">
                    Sem alertas recentes.
                  </td>
                </tr>
              )}

              {rows}

              {loading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-200">
                    Carregando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="mt-2 rounded-md border border-red-800/80 bg-red-900/40 p-3 text-base text-red-200">
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

  // auto-popup apenas quando o topo muda
  const lastTopSigRef = useRef<string | null>(null);

  const onRowClick = useCallback((a: AlertItem) => {
    setSelected(a);
    setPopupOpen(true);
  }, []);

  // Snapshot inicial
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

  // WebSocket (canal /ws/slow)
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

            const nextTop = next[0];
            const sig = nextTop ? `${nextTop.code}|${nextTop.origin}|${nextTop.created_at}` : null;

            if (nextTop && sig && sig !== lastTopSigRef.current && !popupOpen) {
              setSelected(nextTop);
              setPopupOpen(true);
            }
            lastTopSigRef.current = sig;

            return next;
          });
        } catch {
          // ignore
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
            <h1>Alerts</h1>
            <p className="page-subtitle">Últimos 5 alertas do sistema.</p>
          </div>
          <AlertsConfigSheet />
        </header>

        <AlertsTable items={items} loading={loading} error={error} onRowClick={onRowClick} />
      </div>

      <Dialog open={popupOpen} onOpenChange={setPopupOpen}>
        <DialogContent className="sm:max-w-xl bg-slate-900 text-slate-100 border border-slate-700 text-[17px] md:text-[18px]">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-2xl md:text-3xl">
                  <span className={severityPillClasses(selected.severity)}>{severityLabel(selected.severity)}</span>
                  <span className="font-mono tracking-wide">{selected.code}</span>
                </DialogTitle>
                <DialogDescription className="pt-1 text-slate-200 text-lg">
                  <span className="font-semibold text-foreground">{selected.message}</span>
                  {selected.origin ? <span className="ml-3 opacity-80">• Origem: {selected.origin}</span> : null}
                  <span className="ml-3 opacity-70">
                    {(() => {
                      const abs = parseServerTs(selected.created_at);
                      return abs != null ? dtf.format(new Date(abs)) : "—";
                    })()}
                  </span>
                </DialogDescription>
              </DialogHeader>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default AlertsPage;
