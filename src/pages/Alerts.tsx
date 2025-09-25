// src/pages/alerts.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Severity = "low" | "medium" | "high" | "critical";
type Status = "open" | "ack" | "resolved";

type AlertItem = {
  id: string | number;
  ts: string; // ISO
  type?: string;
  message: string;
  severity: Severity;
  status: Status;
  source?: string;
  actuatorId?: number;
};

type ListParams = {
  q?: string;
  severity?: "" | Severity;
  status?: "" | Status;
  page?: number; // 1-based
  pageSize?: number;
};

/** --- Helpers bem simples para falar com a API (rotas típicas) --- */
async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
  }
  return res.json();
}

// Ajuste a BASE se sua API estiver em outro host/porta (ex.: import.meta.env.VITE_API_URL)
const BASE = "/api"; // se o teu backend já está proxado pelo frontend, mantém “/api”

async function listAlerts(params: ListParams): Promise<{ items: AlertItem[]; total: number }> {
  const u = new URL(`${BASE}/alerts`, window.location.origin);
  if (params.q) u.searchParams.set("q", params.q);
  if (params.severity) u.searchParams.set("severity", params.severity);
  if (params.status) u.searchParams.set("status", params.status);
  u.searchParams.set("page", String(params.page ?? 1));
  u.searchParams.set("pageSize", String(params.pageSize ?? 20));
  return fetchJSON(u.toString());
}

async function ackAlert(id: string | number): Promise<void> {
  await fetchJSON(`${BASE}/alerts/${id}/ack`, { method: "POST" });
}

async function resolveAlert(id: string | number): Promise<void> {
  await fetchJSON(`${BASE}/alerts/${id}/resolve`, { method: "POST" });
}

/** ---------------- UI utils ---------------- */
function sevPillClasses(s: Severity) {
  const base = "px-2 py-0.5 rounded-full text-xs font-medium";
  switch (s) {
    case "low":
      return `${base} bg-emerald-900/30 text-emerald-300 ring-1 ring-emerald-500/30`;
    case "medium":
      return `${base} bg-amber-900/30 text-amber-300 ring-1 ring-amber-500/30`;
    case "high":
      return `${base} bg-orange-900/30 text-orange-300 ring-1 ring-orange-500/30`;
    case "critical":
      return `${base} bg-red-900/30 text-red-300 ring-1 ring-red-500/30`;
  }
}

function statusPillClasses(s: Status) {
  const base = "px-2 py-0.5 rounded-full text-xs font-medium";
  switch (s) {
    case "open":
      return `${base} bg-blue-900/30 text-blue-300 ring-1 ring-blue-500/30`;
    case "ack":
      return `${base} bg-zinc-800 text-zinc-200 ring-1 ring-zinc-600/40`;
    case "resolved":
      return `${base} bg-emerald-900/30 text-emerald-300 ring-1 ring-emerald-500/30`;
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

/** ---------------- Page ---------------- */
const PAGE_SIZE = 15;
const REFRESH_MS = 10000;

const AlertsPage: React.FC = () => {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filtros
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState<"" | Severity>("");
  const [status, setStatus] = useState<"" | Status>("open");
  const [page, setPage] = useState(1);

  // auto refresh
  const [auto, setAuto] = useState(true);
  const timerRef = useRef<number | null>(null);

  const maxPage = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAlerts({ q, severity, status, page, pageSize: PAGE_SIZE });
      setItems(res.items ?? []);
      setTotal(res.total ?? res.items?.length ?? 0);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao buscar alertas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, severity, status, page]);

  useEffect(() => {
    if (!auto) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = window.setInterval(load, REFRESH_MS);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, q, severity, status, page]);

  const onAck = async (id: AlertItem["id"]) => {
    try {
      await ackAlert(id);
      await load();
    } catch (e: any) {
      alert(`Falha ao ACK: ${e?.message ?? e}`);
    }
  };

  const onResolve = async (id: AlertItem["id"]) => {
    try {
      await resolveAlert(id);
      await load();
    } catch (e: any) {
      alert(`Falha ao resolver: ${e?.message ?? e}`);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-8 pb-12">
        <header className="mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">Alerts</h1>
          <p className="mt-1 text-sm md:text-base text-muted-foreground">
            Central de eventos e alarmes do sistema.
          </p>
        </header>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl font-bold">Lista de alertas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filtros */}
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-zinc-400 w-20">Busca</label>
                  <input
                    value={q}
                    onChange={(e) => {
                      setPage(1);
                      setQ(e.target.value);
                    }}
                    placeholder="texto, tipo, origem…"
                    className="h-9 w-64 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-600"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-zinc-400 w-20">Severidade</label>
                  <select
                    value={severity}
                    onChange={(e) => {
                      setPage(1);
                      setSeverity(e.target.value as any);
                    }}
                    className="h-9 w-40 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm outline-none focus:ring-2 focus:ring-zinc-600"
                  >
                    <option value="">Todas</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-zinc-400 w-20">Status</label>
                  <select
                    value={status}
                    onChange={(e) => {
                      setPage(1);
                      setStatus(e.target.value as any);
                    }}
                    className="h-9 w-40 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm outline-none focus:ring-2 focus:ring-zinc-600"
                  >
                    <option value="">Todos</option>
                    <option value="open">Open</option>
                    <option value="ack">Acknowledged</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAuto((v) => !v)}
                  className={`h-9 rounded-md px-3 text-sm border ${
                    auto
                      ? "border-emerald-700 bg-emerald-900/20 text-emerald-300"
                      : "border-zinc-700 bg-zinc-900 text-zinc-300"
                  }`}
                  title="Auto refresh a cada 10s"
                >
                  Auto-refresh: {auto ? "ON" : "OFF"}
                </button>
                <button
                  onClick={() => load()}
                  disabled={loading}
                  className="h-9 rounded-md px-3 text-sm border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
                >
                  {loading ? "Atualizando…" : "Atualizar"}
                </button>
              </div>
            </div>

            {/* Tabela */}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="py-2 text-left font-semibold">Quando</th>
                    <th className="py-2 text-left font-semibold">Sev.</th>
                    <th className="py-2 text-left font-semibold">Status</th>
                    <th className="py-2 text-left font-semibold">Tipo</th>
                    <th className="py-2 text-left font-semibold">Mensagem</th>
                    <th className="py-2 text-left font-semibold">Origem</th>
                    <th className="py-2 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-zinc-400">
                        Nenhum alerta encontrado.
                      </td>
                    </tr>
                  )}

                  {items.map((a) => (
                    <tr key={a.id} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                      <td className="py-2 align-top">
                        <div className="text-zinc-200">{timeSince(a.ts)} ago</div>
                        <div className="text-xs text-zinc-500">{new Date(a.ts).toLocaleString()}</div>
                      </td>
                      <td className="py-2 align-top">
                        <span className={sevPillClasses(a.severity)}>{a.severity}</span>
                      </td>
                      <td className="py-2 align-top">
                        <span className={statusPillClasses(a.status)}>
                          {a.status === "ack" ? "acknowledged" : a.status}
                        </span>
                      </td>
                      <td className="py-2 align-top text-zinc-200">{a.type ?? "-"}</td>
                      <td className="py-2 align-top">
                        <div className="text-zinc-200">{a.message}</div>
                        {a.actuatorId != null && (
                          <div className="text-xs text-zinc-500 mt-0.5">A{a.actuatorId}</div>
                        )}
                      </td>
                      <td className="py-2 align-top text-zinc-400">{a.source ?? "-"}</td>
                      <td className="py-2 align-top">
                        <div className="flex justify-end gap-2">
                          {a.status === "open" && (
                            <button
                              onClick={() => onAck(a.id)}
                              className="h-8 rounded-md px-3 text-xs border border-sky-700 bg-sky-900/20 text-sky-300 hover:bg-sky-900/40"
                            >
                              Acknowledge
                            </button>
                          )}
                          {a.status !== "resolved" && (
                            <button
                              onClick={() => onResolve(a.id)}
                              className="h-8 rounded-md px-3 text-xs border border-emerald-700 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/40"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {loading && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-zinc-400">
                        Carregando…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-zinc-500">
                {items.length > 0
                  ? `Mostrando ${(page - 1) * PAGE_SIZE + 1}–${Math.min(
                      page * PAGE_SIZE,
                      total
                    )} de ${total}`
                  : `0 de ${total}`}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-8 rounded-md px-3 text-xs border border-zinc-700 bg-zinc-900 text-zinc-200 disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-xs text-zinc-400">
                  Página {page} / {maxPage}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                  disabled={page >= maxPage}
                  className="h-8 rounded-md px-3 text-xs border border-zinc-700 bg-zinc-900 text-zinc-200 disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-2 rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
                {error}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default AlertsPage;
