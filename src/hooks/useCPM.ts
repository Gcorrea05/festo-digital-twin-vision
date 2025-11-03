// src/hooks/useCpm.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { getCpmRuntimeMinute } from "@/lib/api";

// Tipo mínimo local (a API só precisa fornecer ts e cpm)
type CpmMinutePoint = {
  ts: string;
  cpm: number;
};

export function useCpmRuntime(opts?: {
  actuatorId?: number;
  minutes?: number; // janela (padrão 120)
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

        // Cancela requisição anterior, se houver
        if (inFlight.current) inFlight.current.abort();
        inFlight.current = new AbortController();

        // Passa o signal se a função aceitar (cast para evitar erro de tipo)
        const rawRows: any[] =
          await (getCpmRuntimeMinute as any)({ actuatorId, minutes }, inFlight.current.signal);

        if (!alive) return;

        // Normaliza defensivamente o shape vindo da API
        const rows: CpmMinutePoint[] = (rawRows ?? [])
          .map((r: any) => ({
            ts: String(r?.ts ?? r?.minute ?? r?.time ?? ""),
            cpm: Number(r?.cpm ?? r?.value ?? 0),
          }))
          // filtra entradas sem ts válido
          .filter((r) => r.ts);

        // Ordena por ts
        const sorted = [...rows].sort((a, b) => {
          const ta = new Date(a.ts).getTime();
          const tb = new Date(b.ts).getTime();
          return ta - tb;
        });

        setData(sorted);
      } catch (e: any) {
        if (!alive) return;
        if (e?.name !== "AbortError") {
          setErr(e?.message ?? String(e));
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      if (inFlight.current) {
        inFlight.current.abort();
        inFlight.current = null;
      }
    };
  }, [actuatorId, minutes]);

  // Eixo X amigável (HH:MM), com proteção contra ts inválido
  const chartData = useMemo(
    () =>
      (data ?? []).map((d) => {
        const dt = new Date(d.ts);
        const valid = Number.isFinite(dt.getTime());
        const hh = valid ? String(dt.getHours()).padStart(2, "0") : "";
        const mm = valid ? String(dt.getMinutes()).padStart(2, "0") : "";
        return {
          ts: d.ts,
          minuteLabel: valid ? `${hh}:${mm}` : "",
          cpm: Number.isFinite(Number(d.cpm)) ? Number(d.cpm) : 0,
        };
      }),
    [data]
  );

  return { data, chartData, loading, error: err };
}
