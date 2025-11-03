// src/hooks/useHistoryPlayer.ts
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getOPCHistory,
  getMPUHistory,
  type OPCHistoryRow,
  type MpuHistoryRow,
} from "@/lib/api";

// ===== Helpers =====
function rms(arr: number[]): number {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v * v;
  return Math.sqrt(s / arr.length);
}

// normaliza qualquer valor do OPC para 0/1
function to01(v: unknown): 0 | 1 {
  if (v === true || v === "true" || v === "True" || v === "TRUE") return 1;
  if (v === false || v === "false" || v === "False" || v === "FALSE") return 0;
  if (v === 1 || v === "1") return 1;
  if (v === 0 || v === "0") return 0;
  const n = Number(v);
  if (Number.isFinite(n)) return n > 0 ? 1 : 0;
  return 0;
}

function stateOf(s1: number, s2: number): "RECUADO" | "AVANCADO" | "TRANSICAO" {
  if (s1 === 1 && s2 === 0) return "RECUADO";
  if (s1 === 0 && s2 === 1) return "AVANCADO";
  return "TRANSICAO";
}

// Formatos internos
type OpcSample = { ts_utc: string; value_bool: 0 | 1 };
type MpuSample = { ts_utc: string; ax_g: number; ay_g: number; az_g: number };

// converte rows do OPC normalizados pela api para nosso shape
const toOpcSamples = (rows: OPCHistoryRow[] = []): OpcSample[] =>
  rows.map((r) => ({
    ts_utc: r.ts,
    value_bool: to01(r.value),
  }));

/**
 * computeCPMFromTrack: conta bordas 0→1 em uma trilha (ex.: S2),
 * evitando indexar tail[i-1] diretamente (elimina “possibly undefined”).
 */
function computeCPMFromTrack(track: OpcSample[], tailLen = 200): number {
  const n = track.length;
  if (n < 2) return 0;
  const start = Math.max(0, n - tailLen);
  let c = 0;
  let prev = track[start]?.value_bool ?? 0;
  for (let i = start + 1; i < n; i++) {
    const curr = track[i]?.value_bool ?? 0;
    if (prev === 0 && curr === 1) c++;
    prev = curr;
  }
  return c; // janela curta -> aproxima cpm
}

export function useHistoryPlayer() {
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);

  // buffers (A1/A2; S1=Recuado, S2=Avançado)
  const r1 = useRef<OpcSample[]>([]); // Recuado_1S1
  const a1 = useRef<OpcSample[]>([]); // Avancado_1S2
  const r2 = useRef<OpcSample[]>([]); // Recuado_2S1
  const a2 = useRef<OpcSample[]>([]); // Avancado_2S2
  const mpu = useRef<MpuSample[]>([]); // “MPUA1” (exemplo)

  const minLen = useMemo(() => {
    const lens = [r1.current.length, a1.current.length, r2.current.length, a2.current.length].filter(
      (v) => Number.isFinite(v) && v > 0
    ) as number[];
    return lens.length ? Math.min(...lens) : 0;
  }, [ready]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const SINCE_OPC = "-30m";
        const SINCE_MPU = "-5m";

        // OPC (assinatura atual do front: actuatorId + facet "S1" | "S2")
        const [jr1, ja1, jr2, ja2] = await Promise.all([
          getOPCHistory({ actuatorId: 1, facet: "S1", since: SINCE_OPC, asc: true }),
          getOPCHistory({ actuatorId: 1, facet: "S2", since: SINCE_OPC, asc: true }),
          getOPCHistory({ actuatorId: 2, facet: "S1", since: SINCE_OPC, asc: true }),
          getOPCHistory({ actuatorId: 2, facet: "S2", since: SINCE_OPC, asc: true }),
        ]);

        const r1n = toOpcSamples(jr1);
        const a1n = toOpcSamples(ja1);
        const r2n = toOpcSamples(jr2);
        const a2n = toOpcSamples(ja2);

        // MPU (tua api.ts: getMPUHistory(id, since, limit, asc))
        const mpuRows: MpuHistoryRow[] = await getMPUHistory("MPUA1", SINCE_MPU, 2000, true).catch(() => []);
        const mpun: MpuSample[] = (mpuRows || []).map((m) => ({
          ts_utc: m.ts,
          ax_g: Number(m.ax ?? 0),
          ay_g: Number(m.ay ?? 0),
          az_g: Number(m.az ?? 0),
        }));

        if (!mounted) return;

        r1.current = r1n;
        a1.current = a1n;
        r2.current = r2n;
        a2.current = a2n;
        mpu.current = mpun;

        setIdx(0);
        setReady(true);
      } catch (e) {
        console.error("[useHistoryPlayer] load error", e);
        setReady(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || minLen <= 0) return;
    const t = window.setInterval(() => setIdx((i) => i + 1), 2000);
    return () => window.clearInterval(t);
  }, [ready, minLen]);

  const { vibrationText, statusText, cpmText } = useMemo(() => {
    if (!ready || minLen <= 0) {
      return { vibrationText: "Aguardando...", statusText: "Aguardando...", cpmText: "Aguardando..." };
    }
    const i = idx % minLen;

    // Status por atuador (com defaults para silenciar “possibly undefined”)
    const sA1 = stateOf(
      Number(r1.current[i]?.value_bool ?? 0),
      Number(a1.current[i]?.value_bool ?? 0)
    );
    const sA2 = stateOf(
      Number(r2.current[i]?.value_bool ?? 0),
      Number(a2.current[i]?.value_bool ?? 0)
    );
    const statusText = `A1:${sA1} | A2:${sA2}`;

    // Vibração (RMS dos eixos)
    let vibrationText = "—";
    if (mpu.current.length) {
      const ax = mpu.current.map((s) => Number(s?.ax_g ?? 0));
      const ay = mpu.current.map((s) => Number(s?.ay_g ?? 0));
      const az = mpu.current.map((s) => Number(s?.az_g ?? 0));
      const r = Math.sqrt(rms(ax) ** 2 + rms(ay) ** 2 + rms(az) ** 2);
      vibrationText = `${r.toFixed(3)} g`;
    }

    // CPM aproximado (bordas 0→1 de S2 do A1)
    const cpmVal = computeCPMFromTrack(a1.current, 200);
    const cpmText = `${cpmVal.toFixed(2)} cpm`;

    return { vibrationText, statusText, cpmText };
  }, [idx, ready, minLen]);

  return { ready, vibrationText, statusText, cpmText };
}
