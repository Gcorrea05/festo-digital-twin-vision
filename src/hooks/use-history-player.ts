// src/hooks/useHistoryPlayer.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { getOPCHistory, getMPUHistory } from "@/lib/api";

// Formatos mínimos usados internamente
type OpcHistItem = { ts: string; value: number }; // getOPCHistory já normaliza para {ts,value}
type OpcSample = { ts_utc: string; value_bool: any };
type MpuSample = { ts_utc: string; ax_g: number; ay_g: number; az_g: number };

// ---------- helpers locais (não existem em @/lib/api) ----------
function rms(arr: number[]): number {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v * v;
  return Math.sqrt(s / arr.length);
}

function stateOf(s1: number, s2: number): "RECUADO" | "AVANCADO" | "TRANSICAO" {
  if (s1 === 1 && s2 === 0) return "RECUADO";
  if (s1 === 0 && s2 === 1) return "AVANCADO";
  return "TRANSICAO";
}

/**
 * computeCPM: conta “subidas 0→1” em uma trilha de OPC recente (cauda),
 * representada por amostras com { value_bool } e ordenadas por tempo.
 * Se a trilha de INICIA (start) estiver vazia, tenta usar a de PARA (stop).
 */
function computeCPM(tailStart: OpcSample[], tailStop: OpcSample[]): number {
  const countRises = (samples: OpcSample[]) => {
    let c = 0;
    for (let i = 1; i < samples.length; i++) {
      const prev = Number(!!samples[i - 1].value_bool);
      const curr = Number(!!samples[i].value_bool);
      if (prev === 0 && curr === 1) c++;
    }
    return c;
  };
  const c = tailStart.length ? countRises(tailStart) : countRises(tailStop);
  return c; // como a janela é curta, tratamos como “ciclos por minuto” aprox.
}

export function useHistoryPlayer() {
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);

  // buffers
  const r1 = useRef<OpcSample[]>([]); // Recuado_1S1
  const a1 = useRef<OpcSample[]>([]); // Avancado_1S2
  const r2 = useRef<OpcSample[]>([]); // Recuado_2S1
  const a2 = useRef<OpcSample[]>([]); // Avancado_2S2
  const inicia = useRef<OpcSample[]>([]); // INICIA
  const para = useRef<OpcSample[]>([]);   // PARA
  const mpu = useRef<MpuSample[]>([]);    // MPUA1

  const minLen = useMemo(() => {
    const lens = [r1.current.length, a1.current.length, r2.current.length, a2.current.length].filter(Boolean);
    return lens.length ? Math.min(...lens) : 0;
  }, [ready]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Carrega 30 minutos para ter material suficiente no player
        const SINCE_OPC = "-30m";
        const SINCE_MPU = "-5m";

        // OPC (usando assinatura atual: actuatorId + facet)
        const [jr1, ja1, jr2, ja2, jini, jpar] = await Promise.all([
          getOPCHistory({ actuatorId: 1, facet: "S1", since: SINCE_OPC, asc: true, limit: 5000 }),
          getOPCHistory({ actuatorId: 1, facet: "S2", since: SINCE_OPC, asc: true, limit: 5000 }),
          getOPCHistory({ actuatorId: 2, facet: "S1", since: SINCE_OPC, asc: true, limit: 5000 }),
          getOPCHistory({ actuatorId: 2, facet: "S2", since: SINCE_OPC, asc: true, limit: 5000 }),
          getOPCHistory({ actuatorId: 1, facet: "INICIA", since: SINCE_OPC, asc: true, limit: 5000 }),
          getOPCHistory({ actuatorId: 1, facet: "PARA",   since: SINCE_OPC, asc: true, limit: 5000 }),
        ]);

        // Normaliza para o shape OpcSample esperado pelo player (ts_utc/value_bool)
        const toOpcSamples = (rows: OpcHistItem[]): OpcSample[] =>
          rows.map((r) => ({ ts_utc: r.ts, value_bool: r.value ? true : false }));

        const r1n = toOpcSamples(jr1);
        const a1n = toOpcSamples(ja1);
        const r2n = toOpcSamples(jr2);
        const a2n = toOpcSamples(ja2);
        const inin = toOpcSamples(jini);
        const paran = toOpcSamples(jpar);

        // MPU (assinatura atual: getMPUHistory({ id, since, ... }) → array direto)
        const mpuRows = await getMPUHistory({ id: "MPUA1", since: SINCE_MPU, asc: true, limit: 2000 }).catch(() => []);
        const mpun: MpuSample[] = (mpuRows || []).map((m: any) => ({
          ts_utc: m.ts_utc ?? m.ts,
          ax_g: m.ax_g ?? m.ax ?? 0,
          ay_g: m.ay_g ?? m.ay ?? 0,
          az_g: m.az_g ?? m.az ?? 0,
        }));

        if (!mounted) return;

        r1.current = r1n;
        a1.current = a1n;
        r2.current = r2n;
        a2.current = a2n;
        inicia.current = inin;
        para.current = paran;
        mpu.current = mpun;

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
    const t = setInterval(() => setIdx((i) => i + 1), 2000);
    return () => clearInterval(t);
  }, [ready, minLen]);

  const { vibrationText, statusText, cpmText } = useMemo(() => {
    if (!ready || minLen <= 0) {
      return { vibrationText: "Aguardando...", statusText: "Aguardando...", cpmText: "Aguardando..." };
    }
    const i = idx % minLen;

    // Status por atuador
    const s1 = stateOf(Number(!!r1.current[i]?.value_bool), Number(!!a1.current[i]?.value_bool));
    const s2 = stateOf(Number(!!r2.current[i]?.value_bool), Number(!!a2.current[i]?.value_bool));
    const statusText = `A1:${s1} | A2:${s2}`;

    // Vibração (RMS dos eixos)
    let vibrationText = "—";
    if (mpu.current.length) {
      const ax = mpu.current.map((s) => Number(s.ax_g || 0));
      const ay = mpu.current.map((s) => Number(s.ay_g || 0));
      const az = mpu.current.map((s) => Number(s.az_g || 0));
      const r = Math.sqrt(rms(ax) ** 2 + rms(ay) ** 2 + rms(az) ** 2);
      vibrationText = `${r.toFixed(3)} g`;
    }

    // CPM aproximado com base nas bordas recentes (usa INICIA; se vazio, usa PARA)
    const tailLen = 200;
    const tailI = inicia.current.slice(Math.max(0, i - tailLen), i);
    const tailP = para.current.slice(Math.max(0, i - tailLen), i);
    const cpmVal = computeCPM(tailI, tailP);
    const cpmText = `${cpmVal.toFixed(2)} cpm`;

    return { vibrationText, statusText, cpmText };
  }, [idx, ready, minLen]);

  return { ready, vibrationText, statusText, cpmText };
}
