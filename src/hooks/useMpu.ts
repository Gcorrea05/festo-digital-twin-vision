// src/hooks/useMpu.ts
import { useEffect, useRef, useState } from "react";
import { openMpuWS, WSClient } from "@/lib/ws";
import { getMpuIds, getMPUHistory, getLatestMPU } from "@/lib/api";

export type MpuSample = {
  ts: string;
  id: string; // "MPUA1" | "MPUA2"
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
  temp_c: number;
};

// ===== Hook: lista de IDs do MPU =====
export function useMpuIds() {
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getMpuIds()
      .then((list) => { setIds(list); setError(null); })
      .catch((e) => setError(e?.message ?? "Erro ao listar MPUs"))
      .finally(() => setLoading(false));
  }, []);

  return { ids, loading, error };
}

// ===== Hook: histórico do MPU (usa GET /mpu/history) =====
export function useMpuHistory(
  id: string | null,
  since = "-5m",
  limit = 1000,
  asc = true
) {
  const [rows, setRows] = useState<MpuSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setRows([]); setLoading(false); return; }
    setLoading(true);
    getMPUHistory({ id, since, limit, asc })
      .then((r) => {
        // normaliza possíveis chaves *_g e *_dps vindas da API
        const norm = (r || []).map((m: any) => ({
          ts: m.ts_utc ?? m.ts,
          id: m.id,
          ax: m.ax ?? m.ax_g ?? 0,
          ay: m.ay ?? m.ay_g ?? 0,
          az: m.az ?? m.az_g ?? 0,
          gx: m.gx ?? m.gx_dps ?? 0,
          gy: m.gy ?? m.gy_dps ?? 0,
          gz: m.gz ?? m.gz_dps ?? 0,
          temp_c: m.temp_c ?? 0,
        })) as MpuSample[];
        setRows(norm);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? "Erro ao buscar histórico MPU"))
      .finally(() => setLoading(false));
  }, [id, since, limit, asc]);

  return { rows, loading, error };
}

// ===== Hook: último valor do MPU (usa GET /mpu/latest) =====
export function useMpuLatest(id: string | null) {
  const [sample, setSample] = useState<MpuSample | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setSample(null); setLoading(false); return; }
    setLoading(true);
    getLatestMPU(id)
      .then((m) => {
        const s: MpuSample = {
          ts: m.ts_utc ?? m.ts ?? new Date().toISOString(),
          id: m.id,
          ax: m.ax ?? m.ax_g ?? 0,
          ay: m.ay ?? m.ay_g ?? 0,
          az: m.az ?? m.az_g ?? 0,
          gx: m.gx ?? m.gx_dps ?? 0,
          gy: m.gy ?? m.gy_dps ?? 0,
          gz: m.gz ?? m.gz_dps ?? 0,
          temp_c: m.temp_c ?? 0,
        };
        setSample(s);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? "Erro ao buscar último MPU"))
      .finally(() => setLoading(false));
  }, [id]);

  return { sample, loading, error };
}

// ===== Hook: stream via WebSocket (/ws/mpu) =====
export function useMpuStream(opts?: { id?: string; all?: boolean }) {
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<MpuSample | null>(null);
  const clientRef = useRef<WSClient | null>(null);

  useEffect(() => {
    // encerra conexão anterior (se existir)
    clientRef.current?.close();

    const client = openMpuWS({
      id: opts?.id,
      all: opts?.all ?? (!opts?.id),
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onError: () => setConnected(false),
      onMessage: (m: any) => {
        // normaliza registro vindo do WS (ax_g/gx_dps → ax/gx, etc.)
        if (m?.id && (m.ax_g !== undefined || m.ax !== undefined)) {
          const s: MpuSample = {
            ts: m.ts_utc ?? m.ts ?? new Date().toISOString(),
            id: m.id,
            ax: m.ax ?? m.ax_g ?? 0,
            ay: m.ay ?? m.ay_g ?? 0,
            az: m.az ?? m.az_g ?? 0,
            gx: m.gx ?? m.gx_dps ?? 0,
            gy: m.gy ?? m.gy_dps ?? 0,
            gz: m.gz ?? m.gz_dps ?? 0,
            temp_c: m.temp_c ?? 0,
          };
          setLast(s);
        }
      },
    });

    clientRef.current = client;
    return () => client.close();
  }, [opts?.id, opts?.all]);

  return { connected, last };
}
