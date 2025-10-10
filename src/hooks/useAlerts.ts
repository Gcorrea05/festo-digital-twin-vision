// src/hooks/useAlerts.ts
import { useEffect, useMemo, useSyncExternalStore, useRef } from "react";
import { getAlerts, type AlertItem } from "@/lib/api";

export type UseAlertsOpts = {
  /** Polling em ms — default 15s */
  pollMs?: number;
  /** Quantos itens buscar — default 5 */
  limit?: number;
  /** Habilita/desabilita o polling (default true) */
  enabled?: boolean;
  /** Callback quando chega alerta novo (ID não visto antes) */
  onNewAlert?: (a: AlertItem) => void;
};

/* =========================
   Store compartilhado (singleton)
   ========================= */
type StoreState = {
  items: AlertItem[];
  loading: boolean;
  error: string | null;
};
type Config = { pollMs: number; limit: number };

let state: StoreState = { items: [], loading: true, error: null };
let subscribers = new Set<() => void>();
let knownIds = new Set<string | number>();
let intervalId: number | null = null;
let currentCfg: Config = { pollMs: 15000, limit: 5 };
let inFlight = false;

function emit() { for (const cb of subscribers) cb(); }

async function fetchOnce(cfg = currentCfg, onNewAlert?: (a: AlertItem) => void) {
  if (inFlight) return;            // evita rajadas
  inFlight = true;
  try {
    state = { ...state, loading: true };
    emit();

    const data = await getAlerts(cfg.limit);
    const list = Array.isArray((data as any)?.items) ? ((data as any).items as AlertItem[]) : [];

    // avisar só os novos
    for (const a of list) if (!knownIds.has(a.id)) onNewAlert?.(a);
    knownIds = new Set(list.map(a => a.id));

    state = { items: list, loading: false, error: null };
  } catch (e: any) {
    state = { ...state, loading: false, error: e?.message ?? "Erro ao buscar alertas" };
  } finally {
    inFlight = false;
    emit();
  }
}

function startPolling(cfg: Config, onNewAlert?: (a: AlertItem) => void) {
  currentCfg = cfg;
  if (intervalId != null) return;  // já rodando
  // primeira busca imediata
  void fetchOnce(cfg, onNewAlert);
  intervalId = window.setInterval(() => fetchOnce(currentCfg, onNewAlert), cfg.pollMs) as unknown as number;
}

function stopPolling() {
  if (subscribers.size === 0 && intervalId != null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

/* =========================
   Hook público
   ========================= */
export function useAlerts(opts?: UseAlertsOpts) {
  const pollMs = opts?.pollMs ?? 15000;
  const limit = opts?.limit ?? 5;
  const enabled = opts?.enabled ?? true;
  const onNewAlert = opts?.onNewAlert;

  // assinatura do store
  const subscribe = (onStoreChange: () => void) => {
    subscribers.add(onStoreChange);
    // start/pause
    if (enabled) startPolling({ pollMs, limit }, onNewAlert);
    return () => {
      subscribers.delete(onStoreChange);
      stopPolling();
    };
  };

  // expõe snapshot atual
  const getSnapshot = () => state;
  const getServerSnapshot = () => state;

  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // se opções mudarem, atualiza o polling ativo
  const lastCfg = useRef<{ pollMs: number; limit: number; enabled: boolean }>();
  useEffect(() => {
    const prev = lastCfg.current;
    lastCfg.current = { pollMs, limit, enabled };
    if (!prev) return;

    // habilitou
    if (!prev.enabled && enabled) startPolling({ pollMs, limit }, onNewAlert);
    // desabilitou
    if (prev.enabled && !enabled) {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    }
    // alterou cfg com polling ligado
    if (enabled && (prev.pollMs !== pollMs || prev.limit !== limit)) {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      startPolling({ pollMs, limit }, onNewAlert);
    }
  }, [pollMs, limit, enabled, onNewAlert]);

  // refresh manual exposto
  const refresh = useMemo(
    () => () => fetchOnce({ pollMs, limit }, onNewAlert),
    [pollMs, limit, onNewAlert]
  );

  return { ...snap, refresh };
}

/* =========================
   Uso opcional (uma única chamada, sem polling)
   ========================= */
export async function fetchAlertsOnce(limit = 5) {
  const data = await getAlerts(limit);
  return (Array.isArray((data as any)?.items) ? (data as any).items : []) as AlertItem[];
}
