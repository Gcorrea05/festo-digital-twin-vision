import React, { useEffect, useMemo, useState } from "react";
import { getOPCHistory, getMPUHistory, rms, stateOf } from "@/lib/api";

type OpcSample = { ts_utc: string; value_bool: any };
type MpuSample = { ts_utc: string; ax_g: number; ay_g: number; az_g: number };

// ---- helpers específicos para este componente ----
function risingEdges(arr: OpcSample[]): number[] {
  // retorna timestamps (ms) onde value_bool sobe 0->1
  const out: number[] = [];
  let prev = 0;
  for (const s of arr) {
    const v = Number(!!s.value_bool);
    if (v === 1 && prev === 0) out.push(Date.parse(s.ts_utc));
    prev = v;
  }
  return out;
}

function computeCPMWindow(inicia: OpcSample[], para: OpcSample[], endIdx: number, win: number) {
  // usa uma janela por AMOSTRAS como no seu HTML (endIdx - win .. endIdx)
  if (!inicia.length || !para.length) return { cpm: NaN, label: "(sem INICIA/PARA)" };

  const iEnd = Math.min(endIdx, Math.max(inicia.length, para.length));
  const iStart = Math.max(0, iEnd - win);

  const tailI = inicia.slice(Math.min(iStart, inicia.length), Math.min(iEnd, inicia.length));
  const tailP = para.slice(Math.min(iStart, para.length),   Math.min(iEnd, para.length));

  const rI = risingEdges(tailI);
  const rP = risingEdges(tailP);
  const pairs = Math.min(rI.length, rP.length);
  if (pairs === 0) return { cpm: NaN, label: "(sem pares na janela)" };

  const firstTs = Math.min(rI[0] ?? Infinity, rP[0] ?? Infinity);
  const lastTs  = Math.max(rI.at(-1) ?? -Infinity, rP.at(-1) ?? -Infinity);
  const spanSec = Math.max(1, (lastTs - firstTs) / 1000);

  const cycles = pairs;                 // 1 par ~ 1 ciclo
  const cpm = (cycles * 60) / spanSec;  // ciclos por minuto
  return { cpm, label: "" };
}

export default function LiveMetrics() {
  // séries (estado => re-render assegurado)
  const [r1, setR1] = useState<OpcSample[]>([]);
  const [a1, setA1] = useState<OpcSample[]>([]);
  const [r2, setR2] = useState<OpcSample[]>([]);
  const [a2, setA2] = useState<OpcSample[]>([]);
  const [ini, setIni] = useState<OpcSample[]>([]);
  const [par, setPar] = useState<OpcSample[]>([]);
  const [mpu, setMpu] = useState<MpuSample[]>([]);

  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);

  // carrega com fallbacks de período (garante dados mesmo se antigos)
  useEffect(() => {
    let mounted = true;

    const loadOPCWithFallback = async (name: string): Promise<OpcSample[]> => {
      const tries = [undefined, "-7d", "-30d", "-365d"] as (string | undefined)[];
      for (const since of tries) {
        try {
          const j = await getOPCHistory(name, since, 20000);
          if (j.items?.length) return j.items as OpcSample[];
        } catch {}
      }
      return [];
    };

    (async () => {
      try {
        const [jr1, ja1, jr2, ja2, jini, jpar, jmpu] = await Promise.all([
          loadOPCWithFallback("Recuado_1S1"),
          loadOPCWithFallback("Avancado_1S2"),
          loadOPCWithFallback("Recuado_2S1"),
          loadOPCWithFallback("Avancado_2S2"),
          loadOPCWithFallback("INICIA"),
          loadOPCWithFallback("PARA"),
          (async () => (await getMPUHistory("MPUA1", 20000)).items as MpuSample[])(),
        ]);
        if (!mounted) return;
        setR1(jr1); setA1(ja1); setR2(jr2); setA2(ja2);
        setIni(jini); setPar(jpar); setMpu(jmpu);
        setIdx(0);
        setReady(true);

        console.log("[LiveMetrics] loaded counts =>", {
          r1: jr1.length, a1: ja1.length, r2: jr2.length, a2: ja2.length,
          inicia: jini.length, para: jpar.length, mpu: jmpu.length
        });
      } catch (e) {
        console.error("[LiveMetrics] load error", e);
        setReady(false);
      }
    })();

    return () => { mounted = false; };
  }, []);

  // player: anda a cada 2s
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => setIdx(i => i + 1), 2000);
    return () => clearInterval(t);
  }, [ready]);

  // comprimento base => sempre gira, usando o maior disponível
  const baseLen = useMemo(
    () => Math.max(r1.length, a1.length, r2.length, a2.length, ini.length, par.length, mpu.length, 1),
    [r1.length, a1.length, r2.length, a2.length, ini.length, par.length, mpu.length]
  );

  // frame
  const { vibrationText, statusText, cpmText } = useMemo(() => {
    if (!ready) {
      return { vibrationText: "Aguardando...", statusText: "Aguardando...", cpmText: "Aguardando..." };
    }
    const i = idx % baseLen;

    // ----- STATUS atual -----
    // usa o valor do índice i (alinhado por índice como no seu HTML).
    const bit = (arr: OpcSample[]) => (arr.length ? Number(!!arr[i % arr.length]?.value_bool) : 0);

    const vR1 = bit(r1), vA1 = bit(a1);
    const vR2 = bit(r2), vA2 = bit(a2);

    const s1 = (r1.length || a1.length) ? stateOf(vR1, vA1) : "indef";
    const s2 = (r2.length || a2.length) ? stateOf(vR2, vA2) : "indef";
    const temAlgumOPC = (r1.length || a1.length || r2.length || a2.length) > 0;
    const statusText = temAlgumOPC ? `A1:${s1} | A2:${s2}` : "(sem OPC)";

    // ----- VIBRATION (RMS janela N=50) -----
    let vibrationText = "(sem MPU)";
    if (mpu.length) {
      const iM = i % mpu.length;
      const N = 50;
      const s = Math.max(0, iM - (N - 1));
      const tail = mpu.slice(s, iM + 1);
      const rx = rms(tail.map(s => Number(s.ax_g || 0)));
      const ry = rms(tail.map(s => Number(s.ay_g || 0)));
      const rz = rms(tail.map(s => Number(s.az_g || 0)));
      const r = Math.sqrt(rx * rx + ry * ry + rz * rz);
      vibrationText = `${r.toFixed(3)} g`;
    }

    // ----- CPM (INICIA/PARA por bordas de subida, janela W=200 amostras) -----
    let cpmText = "(sem INICIA/PARA)";
    if (ini.length && par.length) {
      const { cpm, label } = computeCPMWindow(ini, par, i, 200);
      cpmText = Number.isFinite(cpm) ? `${cpm.toFixed(2)} cpm` : label;
    }

    // debug: ver o índice girando
    console.log("[frame]", i, { s1, s2, vibrationText, cpmText });

    return { vibrationText, statusText, cpmText };
  }, [ready, idx, baseLen, r1.length, a1.length, r2.length, a2.length, ini.length, par.length, mpu.length]);

  // ----- layout (inalterado) -----
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <MetricCard title="Vibration" value={vibrationText} />
      <MetricCard title="Status atual" value={statusText} />
      <MetricCard title="CPM" value={cpmText} />
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-700 p-4 bg-slate-900">
      <div className="text-slate-300 text-sm">{title}</div>
      <div className="text-2xl font-semibold mt-1 break-words">{value}</div>
    </div>
  );
}
