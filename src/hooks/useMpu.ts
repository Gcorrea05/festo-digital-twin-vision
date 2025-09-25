// src/hooks/useMpu.ts
// Hooks de MPU via polling (sem WebSocket)

import { useEffect, useMemo, useRef, useState } from "react";
import { getMpuIds as apiGetMpuIds, getMPUHistory, getLatestMPU } from "@/lib/api";

export type MpuSample = {
  ts: string;
  id: string; // "MPUA1" | "MPUA2" | outro identificador
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
  temp_c: number;
};

// Normaliza registros vindos da API (aceita *_g / *_dps / aliases)
function normalizeMPU(m: any): MpuSample {
  return {
    ts: String(m?.ts_utc ?? m?.ts ?? new Date().toISOString()),
    id: String(m?.id ?? m?.mpu_id ?? "MPU"),
    ax: Number(m?.ax ?? m?.ax_g ?? m?.x ?? m?.accel_x ?? 0),
    ay: Number(m?.ay ?? m?.ay_g ?? m?.y ?? m?.accel_y ?? 0),
    az: Number(m?.az ?? m?.az_g ?? m?.z ?? m?.accel_z ?? 0),
    gx: Number(m?.gx ?? m?.gx_dps ?? 0),
    gy: Number(m?.gy ?? m?.gy_dps ?? 0),
    gz: Number(m?.gz ?? m?.gz_dps ?? 0),
    temp_c: Number(m?.temp_c ?? 0),
  };
}

// Converte string/number para o tipo aceito pelo api.ts
// -> number | "MPUA1" | "MPUA2"
function coerceMpuIdForApi(id: string | number): number | "MPUA1" | "MPUA2" {
  if (typeof id === "number") return id;
  const s = String(id).trim();
  if (s === "MPUA1" || s === "MPUA2") return s;
  if (/^\d+$/.test(s)) return Number(s);
  // fallback: tenta inferir pelo sufixo; default para MPUA1
  return s.toUpperCase().includes("A2") ? "MPUA2" : "MPUA1";
}

/* =========================
 *  IDs de MPUs (polling)
 *  Retorna string[] para manter compat com o resto do app.
 * ========================= */
export function useMpuIds(pollMs = 30000) {
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;

    const tick = async () => {
      try {
        setLoading(true);
        const list = await apiGetMpuIds();
        if (!cancelled) {
          const asStrings = Array.isArray(list) ? list.map((v) => String(v)) : [];
          setIds(asStrings);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Erro ao listar MPUs");
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = window.setTimeout(tick, pollMs) as unknown as number;
        }
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pollMs]);

  return { ids, loading, error };
}

/* =========================
 *  Histórico do MPU (polling)
 *  Assinatura usada em Analytics.tsx:
 *    useMpuHistory(mpuId, "-10m", 2000, true)
 * ========================= */
export function useMpuHistory(
  id: string | number | null,
  since: string = "-5m",
  limit: number = 1000,
  asc: boolean = true,
  pollMs: number = 15000
) {
  const [rows, setRows] = useState<MpuSample[]>([]);
  const [loading, setLoading] = useState<boolean>(!!id);
  const [error, setError] = useState<string | null>(null);

  // chave memoizada evita re-poll desnecessário
  const key = useMemo(
    () => (id == null ? null : `${String(id)}|${since}|${limit}|${asc}`),
    [id, since, limit, asc]
  );

  useEffect(() => {
    if (!key || id == null) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    let timer: number | null = null;
    let cancelled = false;

    const tick = async () => {
      try {
        setLoading(true);
        const apiId = coerceMpuIdForApi(id);
        // getMPUHistory em src/lib/api.ts é posicional: (id, since, limit, asc)
        const data = await getMPUHistory(apiId, since, limit, asc);
        if (!cancelled) {
          const norm = (Array.isArray(data) ? data : []).map(normalizeMPU);
          setRows(norm);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Erro ao buscar histórico MPU");
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = window.setTimeout(tick, pollMs) as unknown as number;
        }
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, id, since, limit, asc, pollMs]);

  return { rows, loading, error };
}

/* =========================
 *  Último valor do MPU (polling leve)
 * ========================= */
export function useMpuLatest(id: string | number | null, pollMs = 1000) {
  const [sample, setSample] = useState<MpuSample | null>(null);
  const [loading, setLoading] = useState<boolean>(!!id);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id == null) {
      setSample(null);
      setLoading(false);
      setError(null);
      return;
    }

    let timer: number | null = null;
    let cancelled = false;

    const tick = async () => {
      try {
        setLoading(true);
        const apiId = coerceMpuIdForApi(id);
        // getLatestMPU em src/lib/api.ts aceita (number | "MPUA1" | "MPUA2")
        const m = await getLatestMPU(apiId);
        if (!cancelled) {
          setSample(m ? normalizeMPU(m) : null);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Erro ao buscar último MPU");
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = window.setTimeout(tick, pollMs) as unknown as number;
        }
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, pollMs]);

  return { sample, loading, error };
}

/* =========================
 *  Stub de stream (compat)
 * ========================= */
export function useMpuStream(_opts?: { id?: string | number; all?: boolean }) {
  const [connected] = useState(false);
  const [last] = useState<MpuSample | null>(null);
  return { connected, last };
}
