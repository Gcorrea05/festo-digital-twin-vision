// src/hooks/useActuatorTimings.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { getActuatorTimings, type ActuatorTimingsResp } from "@/lib/api";

export type TimingsNorm = {
  ts: string | null;       // ISO do último ciclo
  open_ms: number | null;  // dt_abre_s * 1000
  close_ms: number | null; // dt_fecha_s * 1000
  cycle_ms: number | null; // dt_ciclo_s * 1000
};

/** Helper: normaliza número em ms (ou null se não vier) */
function toMsOrNull(sec: unknown): number | null {
  if (sec === null || sec === undefined) return null;
  const n = Number(sec);
  if (!Number.isFinite(n)) return null;
  const ms = Math.round(n * 1000);
  return ms >= 0 ? ms : 0;
}

/** Converte resposta bruta do backend para um dicionário por id */
function normalizeTimings(resp?: ActuatorTimingsResp): Record<number, TimingsNorm> {
  const out: Record<number, TimingsNorm> = {};
  const rows = (resp?.actuators ?? []) as any[];

  for (const row of rows) {
    const id = Number((row?.actuator_id ?? row?.id) ?? NaN);
    if (!Number.isFinite(id)) continue;

    const last = (row?.last ?? {}) as {
      ts_utc?: string | null;
      dt_abre_s?: number | string | null;
      dt_fecha_s?: number | string | null;
      dt_ciclo_s?: number | string | null;
    };

    out[id] = {
      ts: last.ts_utc ?? null,
      open_ms: toMsOrNull(last.dt_abre_s),
      close_ms: toMsOrNull(last.dt_fecha_s),
      cycle_ms: toMsOrNull(last.dt_ciclo_s),
    };
  }
  return out;
}

export function useActuatorTimings(pollMs: number = 2000) {
  const [timingsById, setTimingsById] = useState<Record<number, TimingsNorm>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aliveRef = useRef(true);
  const timerRef = useRef<number | null>(null);

  const fetchNow = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await getActuatorTimings(); // GET /api/live/actuators/timings
      const norm = normalizeTimings(resp);
      if (!aliveRef.current) return;
      setTimingsById(norm);
      setError(null);
    } catch (e: any) {
      if (aliveRef.current) setError(e?.message ?? "Erro ao buscar timings");
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void fetchNow();

    // só arma o polling se for positivo
    if (pollMs > 0) {
      timerRef.current = window.setInterval(fetchNow, pollMs) as unknown as number;
    }

    return () => {
      aliveRef.current = false;
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchNow, pollMs]);

  return { timingsById, loading, error, refresh: fetchNow };
}
