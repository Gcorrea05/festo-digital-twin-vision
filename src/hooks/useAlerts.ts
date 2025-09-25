// src/hooks/useAlerts.ts
import { useEffect, useRef, useState } from "react";
import { getAlerts, type AlertItem } from "@/lib/api";

type UseAlertsOpts = {
  /** Polling em ms — default 15s */
  pollMs?: number;
};

export function useAlerts(opts?: UseAlertsOpts) {
  const pollMs = opts?.pollMs ?? 15000;

  const [items, setItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const aliveRef = useRef(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    aliveRef.current = true;

    const tick = async () => {
      try {
        setLoading(true);
        const data = await getAlerts(); // já vem como AlertItem[]
        if (!aliveRef.current) return;
        setItems(Array.isArray(data) ? data : []);
        setError(null);
      } catch (e: any) {
        if (aliveRef.current) setError(e?.message ?? "Erro ao buscar alertas");
      } finally {
        if (aliveRef.current) {
          setLoading(false);
          timerRef.current = window.setTimeout(tick, pollMs) as unknown as number;
        }
      }
    };

    tick();
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pollMs]);

  return { items, loading, error };
}
