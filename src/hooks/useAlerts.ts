// src/hooks/useAlerts.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { getAlerts, type AlertItem } from "@/lib/api";

export type UseAlertsOpts = {
  /** Polling em ms — default 15s */
  pollMs?: number;
  /** Quantos itens buscar — default 5 */
  limit?: number;
  /** Callback disparado quando chega um alerta que não estava na lista anterior */
  onNewAlert?: (a: AlertItem) => void;
};

export function useAlerts(opts?: UseAlertsOpts) {
  const pollMs = opts?.pollMs ?? 15000;
  const limit = opts?.limit ?? 5;

  const [items, setItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const aliveRef = useRef(true);
  const timerRef = useRef<number | null>(null);
  const knownIdsRef = useRef<Set<string | number>>(new Set());

  const tick = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAlerts(limit); // { items, count }
      const list = Array.isArray((data as any)?.items) ? ((data as any).items as AlertItem[]) : [];
      if (!aliveRef.current) return;

      // dispara onNewAlert para IDs que não existiam antes
      const known = knownIdsRef.current;
      for (const a of list) {
        if (!known.has(a.id)) {
          opts?.onNewAlert?.(a);
        }
      }
      knownIdsRef.current = new Set(list.map((a) => a.id));

      setItems(list);
      setError(null);
    } catch (e: any) {
      if (aliveRef.current) setError(e?.message ?? "Erro ao buscar alertas");
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [limit, opts]);

  useEffect(() => {
    aliveRef.current = true;
    tick();
    const id = window.setInterval(tick, pollMs) as unknown as number;
    timerRef.current = id;
    return () => {
      aliveRef.current = false;
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [pollMs, tick]);

  return { items, loading, error, refresh: tick };
}
