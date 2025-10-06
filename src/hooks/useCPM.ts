// src/hooks/useCpm.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { getCpmRuntimeMinute, CpmMinutePoint } from "@/lib/api";

export function useCpmRuntime(opts?: {
  actuatorId?: number;
  minutes?: number; // janela rápida (padrão 120)
}) {
  const { actuatorId, minutes = 120 } = opts || {};
  const [data, setData] = useState<CpmMinutePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        // garante que só 1 fetch esteja ativo
        if (inFlight.current) inFlight.current.abort();
        inFlight.current = new AbortController();

        const rows = await getCpmRuntimeMinute({ actuatorId, minutes });
        if (!alive) return;

        // Ordena por ts só para garantir
        rows.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
        setData(rows);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      if (inFlight.current) inFlight.current.abort();
    };
  }, [actuatorId, minutes]);

  // Label amigável no eixo X (HH:MM)
  const chartData = useMemo(
    () =>
      data.map((d) => {
        const dt = new Date(d.ts);
        const hh = dt.getHours().toString().padStart(2, "0");
        const mm = dt.getMinutes().toString().padStart(2, "0");
        return { ts: d.ts, minuteLabel: `${hh}:${mm}`, cpm: d.cpm };
      }),
    [data]
  );

  return { data, chartData, loading, error: err };
}
