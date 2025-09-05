// src/hooks/useHistoryPlayer.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { getOPCHistory, getMPUHistory, rms, stateOf, computeCPM } from "@/lib/api";

type OpcSample = { ts_utc: string; value_bool: any };
type MpuSample = { ts_utc: string; ax_g: number; ay_g: number; az_g: number };

export function useHistoryPlayer() {
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);

  const r1 = useRef<OpcSample[]>([]);
  const a1 = useRef<OpcSample[]>([]);
  const r2 = useRef<OpcSample[]>([]);
  const a2 = useRef<OpcSample[]>([]);
  const inicia = useRef<OpcSample[]>([]);
  const para = useRef<OpcSample[]>([]);
  const mpu = useRef<MpuSample[]>([]);

  const minLen = useMemo(() => {
    const lens = [r1.current.length, a1.current.length, r2.current.length, a2.current.length].filter(Boolean);
    return lens.length ? Math.min(...lens) : 0;
  }, [ready]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [jr1, ja1, jr2, ja2, jini, jpar, jmpu] = await Promise.all([
          getOPCHistory("Recuado_1S1"),
          getOPCHistory("Avancado_1S2"),
          getOPCHistory("Recuado_2S1"),
          getOPCHistory("Avancado_2S2"),
          getOPCHistory("INICIA"),
          getOPCHistory("PARA"),
          getMPUHistory("MPUA1"),
        ]);
        if (!mounted) return;
        r1.current = jr1.items ?? [];
        a1.current = ja1.items ?? [];
        r2.current = jr2.items ?? [];
        a2.current = ja2.items ?? [];
        inicia.current = jini.items ?? [];
        para.current = jpar.items ?? [];
        mpu.current = jmpu.items ?? [];
        setIdx(0);
        setReady(true);
      } catch (e) {
        console.error("[useHistoryPlayer] load error", e);
        setReady(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!ready || minLen <= 0) return;
    const t = setInterval(() => setIdx(i => i + 1), 2000);
    return () => clearInterval(t);
  }, [ready, minLen]);

  const { vibrationText, statusText, cpmText } = useMemo(() => {
    if (!ready || minLen <= 0) {
      return { vibrationText: "Aguardando...", statusText: "Aguardando...", cpmText: "Aguardando..." };
    }
    const i = idx % minLen;

    const s1 = stateOf(Number(!!r1.current[i]?.value_bool), Number(!!a1.current[i]?.value_bool));
    const s2 = stateOf(Number(!!r2.current[i]?.value_bool), Number(!!a2.current[i]?.value_bool));
    const statusText = `A1:${s1} | A2:${s2}`;

    let vibrationText = "—";
    if (mpu.current.length) {
      const ax = mpu.current.map(s => Number(s.ax_g || 0));
      const ay = mpu.current.map(s => Number(s.ay_g || 0));
      const az = mpu.current.map(s => Number(s.az_g || 0));
      const r = Math.sqrt(rms(ax) ** 2 + rms(ay) ** 2 + rms(az) ** 2);
      vibrationText = `${r.toFixed(3)} g`;
    }

    const tailI = inicia.current.slice(Math.max(0, i - 200), i);
    const tailP = para.current.slice(Math.max(0, i - 200), i);
    const cpmVal = computeCPM(tailI, tailP);
    const cpmText = `${cpmVal.toFixed(2)} cpm`;

    return { vibrationText, statusText, cpmText };
  }, [idx, ready, minLen]);

  return { ready, vibrationText, statusText, cpmText };
}
