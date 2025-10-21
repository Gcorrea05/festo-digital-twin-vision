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

// controle global de habilitação e callback atual
let globallyEnabled = true;
let lastOnNewAlert: ((a: AlertItem) => void) | undefined;

function emit() {
  for (const cb of subscribers) cb();
}

async function fetchOnce(cfg = currentCfg, onNewAlert?: (a: AlertItem) => void) {
  if (inFlight) return; // evita rajadas
  inFlight = true;
  try {
    state = { ...state, loading: true };
    emit();

    const data = await getAlerts(cfg.limit);
    const list = Array.isArray((data as any)?.items)
      ? ((data as any).items as AlertItem[])
      : [];

    // avisar só os novos
    for (const a of list) if (!knownIds.has(a.id)) onNewAlert?.(a);
    knownIds = new Set(list.map((a) => a.id));

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
  lastOnNewAlert = onNewAlert ?? lastOnNewAlert;

  // já tem intervalo ativo? mantém
  if (intervalId != null) return;

  // busca inicial
  void fetchOnce(cfg, lastOnNewAlert);

  intervalId = window.setInterval(
    () => fetchOnce(currentCfg, lastOnNewAlert),
    cfg.pollMs
  ) as unknown as number;
}

function clearIntervalIfAny() {
  if (intervalId != null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

/** Para quando não há mais inscritos OU quando desabilitado manualmente */
function stopPolling() {
  if (subscribers.size === 0) {
    clearIntervalIfAny();
  }
}

/* Pausa por visibilidade (sem mexer no "enabled" do usuário) */
let visibilityHooked = false;
function ensureVisibilityHook() {
  if (visibilityHooked || typeof document === "undefined") return;
  visibilityHooked = true;
  document.addEventListener("visibilitychange", () => {
    const hidden = document.visibilityState === "hidden";
    if (hidden) {
      // pausa temporária
      clearIntervalIfAny();
    } else {
      // retoma se globalmente habilitado
      if (globallyEnabled) startPolling(currentCfg, lastOnNewAlert);
    }
  });
}

/* =========================
   Hook público
   ========================= */
export function useAlerts(opts?: UseAlertsOpts) {
  const pollMs = opts?.pollMs ?? 15000;
  const limit = opts?.limit ?? 5;
  const enabled = opts?.enabled ?? true;
  const onNewAlert = opts?.onNewAlert;

  ensureVisibilityHook();

  // assinatura do store
  const subscribe = (onStoreChange: () => void) => {
    subscribers.add(onStoreChange);

    // sincroniza preferências globais/habilitação
    globallyEnabled = enabled;
    if (enabled && document.visibilityState !== "hidden") {
      startPolling({ pollMs, limit }, onNewAlert);
    }

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

    // guarda callback atualizado
    lastOnNewAlert = onNewAlert ?? lastOnNewAlert;

    if (!prev) return;

    // habilitou
    if (!prev.enabled && enabled) {
      globallyEnabled = true;
      if (document.visibilityState !== "hidden") {
        startPolling({ pollMs, limit }, onNewAlert);
      }
    }

    // desabilitou
    if (prev.enabled && !enabled) {
      globallyEnabled = false;
      clearIntervalIfAny();
    }

    // alterou cfg com polling ligado e aba visível
    if (enabled && (prev.pollMs !== pollMs || prev.limit !== limit)) {
      clearIntervalIfAny();
      if (document.visibilityState !== "hidden") {
        startPolling({ pollMs, limit }, onNewAlert);
      }
    }
  }, [pollMs, limit, enabled, onNewAlert]);

  // refresh manual exposto
  const refresh = useMemo(
    () => () => fetchOnce({ pollMs, limit }, lastOnNewAlert),
    [pollMs, limit]
  );

  // controle programático opcional (pra páginas que querem um toggle local)
  const setPollingEnabled = useMemo(
    () => (v: boolean) => {
      globallyEnabled = v;
      if (v) {
        if (document.visibilityState !== "hidden") {
          startPolling({ pollMs, limit }, lastOnNewAlert);
        }
      } else {
        clearIntervalIfAny();
      }
    },
    [pollMs, limit]
  );

  return { ...snap, refresh, setPollingEnabled };
}

/* =========================
   Uso opcional (uma única chamada, sem polling)
   ========================= */
export async function fetchAlertsOnce(limit = 5) {
  const data = await getAlerts(limit);
  return (Array.isArray((data as any)?.items) ? (data as any).items : []) as AlertItem[];
}
