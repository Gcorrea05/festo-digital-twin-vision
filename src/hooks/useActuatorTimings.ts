// src/hooks/useActuatorTimings.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { getActuatorTimings, type ActuatorTimingsResp } from "@/lib/api";

export type TimingsNorm = {
  ts: string | null;       // ISO do último ciclo
  open_ms: number | null;  // dt_abre_s * 1000
  close_ms: number | null; // dt_fecha_s * 1000
  cycle_ms: number | null; // dt_ciclo_s * 1000
};

function normalizeTimings(resp: ActuatorTimingsResp) {
  const out: Record<number, TimingsNorm> = {};
  for (const row of resp?.actuators ?? []) {
    const id = Number((row as any).actuator_id ?? (row as any).id);
    const last = (row as any).last ?? {};
    out[id] = {
      ts: last.ts_utc ?? null,
      open_ms: last.dt_abre_s != null ? Math.round(Number(last.dt_abre_s) * 1000) : null,
      close_ms: last.dt_fecha_s != null ? Math.round(Number(last.dt_fecha_s) * 1000) : null,
      cycle_ms: last.dt_ciclo_s != null ? Math.round(Number(last.dt_ciclo_s) * 1000) : null,
    };
  }
  return out;
}

export function useActuatorTimings(pollMs: number = 2000) {
  const [timingsById, setTimingsById] = useState<Record<number, TimingsNorm>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const alive = useRef(true);
  const timer = useRef<number | null>(null);

  const fetchNow = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await getActuatorTimings(); // /api/live/actuators/timings
      const norm = normalizeTimings(resp);
      if (!alive.current) return;
      setTimingsById(norm);
      setError(null);
    } catch (e: any) {
      if (alive.current) setError(e?.message ?? "Erro ao buscar timings");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    fetchNow();
    timer.current = window.setInterval(fetchNow, pollMs) as unknown as number;
    return () => {
      alive.current = false;
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
    };
  }, [fetchNow, pollMs]);

  return { timingsById, loading, error, refresh: fetchNow };
}
