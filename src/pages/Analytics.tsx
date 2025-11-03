// src/pages/Analytics.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  // ❗ se precisar tipar algo daqui, use import type { ... } from "recharts"
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { useMpuIds, useMpuHistory } from "@/hooks/useMpu";
import { getMinuteAgg } from "@/lib/api";
import { useActuatorSelection } from "@/context/ActuatorSelectionContext";

/* ========================= Utils ========================= */
function toArray<T = any>(x: any): T[] {
  if (Array.isArray(x)) return x as T[];
  if (!x) return [];
  if (typeof x === "object") {
    if (Array.isArray((x as any).ids)) return (x as any).ids as T[];
    return Object.values(x) as T[];
  }
  return [];
}

// ---- helpers de tempo (tolerantes a undefined) ----
const ensureIsoUtc = (s?: string): string => {
  if (!s) return "";
  const hasTZ = /[zZ]|[+\-]\d{2}:\d{2}$/.test(s);
  return hasTZ ? s : s + "Z";
};
const parseUTC = (s?: string) => new Date(ensureIsoUtc(s));
const toMinuteIsoUTC = (dOrStr?: Date | string): string => {
  const d = typeof dOrStr === "string" ? parseUTC(dOrStr) : (dOrStr ?? new Date(0));
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      0,
      0
    )
  ).toISOString();
};
const fmtHHMM = (val: unknown): string => {
  // aceita string/Date/number/undefined
  const d = new Date(String(val ?? ""));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
};

// subtrai 1g (usado no dataset vindo da API histórica quando não há RMS)
const minusG = (v: number | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n - 1 : 0;
};

/* ========================= Paleta ========================= */
const C = {
  A1: "#7C3AED",
  A2: "#06B6D4",
  RUNTIME_A1: "#16A34A",
  RUNTIME_A2: "#10B981",
};

/* ========================= Tipos ========================= */
type MinuteAgg = {
  minute: string;
  runtime_s: number;
  vib_avg?: number | null;
};
type MpuRowLike = {
  ts?: string;
  ts_utc?: string;
  ax?: number;
  ay?: number;
  az?: number;
  ax_g?: number;
  ay_g?: number;
  az_g?: number;
  gx?: number;
  gy?: number;
  gz?: number;
  gx_dps?: number;
  gy_dps?: number;
  gz_dps?: number;
};
type MpuPoint = {
  ts: string;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
};

/* ========================= Constantes ========================= */
const VIB_POLL_MS = 60_000;

// Conversão de RAW -> g (±2g por padrão). Ajuste se a faixa for outra.
const RAW_TO_G = 1 / 16384;
const pickG = (g?: number, raw?: number) =>
  Number.isFinite(g) ? Number(g) : Number.isFinite(raw) ? Number(raw) * RAW_TO_G : 0;

/* ===== HPF + RMS (vibração dinâmica) ===== */
type HPFState = {
  axPrev: number;
  ayPrev: number;
  azPrev: number;
  xPrev: number;
  yPrev: number;
  zPrev: number;
};
const makeHPF = (alpha: number) => {
  const st: HPFState = { axPrev: 0, ayPrev: 0, azPrev: 0, xPrev: 0, yPrev: 0, zPrev: 0 };
  return (ax: number, ay: number, az: number) => {
    const fx = alpha * (st.axPrev + ax - st.xPrev);
    const fy = alpha * (st.ayPrev + ay - st.yPrev);
    const fz = alpha * (st.azPrev + az - st.zPrev);
    st.axPrev = fx;
    st.ayPrev = fy;
    st.azPrev = fz;
    st.xPrev = ax;
    st.yPrev = ay;
    st.zPrev = az;
    return { fx, fy, fz };
  };
};

// agrega RMS por minuto (sobre vetor filtrado por HPF)
const rmsByMinute = (
  points: { ts: string; ax: number; ay: number; az: number }[],
  alpha = 0.96 // ~ cutoff ~0.5–1 Hz para 100 Hz
) => {
  const hpf = makeHPF(alpha);
  const byMin = new Map<string, { sumSq: number; n: number }>();
  for (const p of points) {
    const { fx, fy, fz } = hpf(p.ax, p.ay, p.az);
    const minute = toMinuteIsoUTC(p.ts);
    const acc = byMin.get(minute) ?? { sumSq: 0, n: 0 };
    acc.sumSq += fx * fx + fy * fy + fz * fz;
    acc.n += 1;
    byMin.set(minute, acc);
  }
  const out: { minute: string; vib: number }[] = [];
  for (const [m, v] of byMin) {
    const meanSq = v.n ? v.sumSq / v.n : 0;
    out.push({ minute: m, vib: Math.sqrt(meanSq) });
  }
  return out.sort((a, b) => a.minute.localeCompare(b.minute));
};

/* ===== Unidade dinâmica para exibição (g, mg, µg) ===== */
type Unit = "g" | "mg" | "µg";
const pickUnit = (maxG: number): Unit => {
  if (!isFinite(maxG) || maxG <= 0) return "g";
  if (maxG >= 0.1) return "g";
  if (maxG >= 0.001) return "mg";
  return "µg";
};
const scaleByUnit = (v: number, unit: Unit) => (unit === "g" ? v : unit === "mg" ? v * 1_000 : v * 1_000_000);
const unitSuffix = (u: Unit) => (u === "g" ? "g" : u === "mg" ? "mg" : "µg");

/* ========================= Página ========================= */
const Analytics: React.FC = () => {
  // ===== Fonte da verdade do atuador selecionado =====
  const { selectedId: act, setSelectedId } = useActuatorSelection();

  // ===== Seletor de gráfico (apenas na aba Vibração) =====
  type VibraOpt = "vib_runtime" | "vib_compare";
  const [optVib, setOptVib] = useState<VibraOpt>("vib_runtime");

  // ===== IDs de MPU e mapeamento (A1 -> idx 0, A2 -> idx 1) =====
  const { ids } = useMpuIds();
  const idsArray = useMemo<(string | number)[]>(() => toArray(ids), [ids]);
  const mpuA1 = idsArray[0] != null ? String(idsArray[0]) : null;
  const mpuA2 = idsArray[1] != null ? String(idsArray[1]) : null;
  const mpuId = useMemo(() => (act === 1 ? mpuA1 : mpuA2), [act, mpuA1, mpuA2]);

  // ===== Vibração (histórico bruto – usado no comparativo A1×A2 e fallback) =====
  const { rows: rowsAct } = useMpuHistory(mpuId, "-10m", 2000, true);
  const { rows: rowsA1 } = useMpuHistory(mpuA1, "-10m", 2000, true);
  const { rows: rowsA2 } = useMpuHistory(mpuA2, "-10m", 2000, true);

  const parseMpu = (src: unknown[]): MpuPoint[] => {
    const a = Array.isArray(src) ? src : [];
    return a.map((r) => {
      const o = r as MpuRowLike;
      return {
        ts: String(o.ts ?? o.ts_utc ?? ""),
        ax: pickG(o.ax_g, o.ax),
        ay: pickG(o.ay_g, o.ay),
        az: pickG(o.az_g, o.az),
        gx: 0,
        gy: 0,
        gz: 0,
      };
    });
  };

  // série principal (atuador selecionado) — para fallback de vib dinâmica/min
  const actMpuRef = useRef<MpuPoint[]>([]);
  const [mpuChartData, setMpuChartData] = useState<MpuPoint[]>([]);
  useEffect(() => {
    const normalized = parseMpu(rowsAct as any);
    const byTs = new Map<string, MpuPoint>();
    for (const p of [...actMpuRef.current, ...normalized]) byTs.set(p.ts, p);
    const merged = Array.from(byTs.values()).sort((a, b) => a.ts.localeCompare(b.ts)).slice(-2000);
    actMpuRef.current = merged;
    setMpuChartData(merged);
  }, [rowsAct]);

  // séries para comparação (A1 × A2)
  const [mpuA1Data, setMpuA1Data] = useState<MpuPoint[]>([]);
  const [mpuA2Data, setMpuA2Data] = useState<MpuPoint[]>([]);
  useEffect(() => setMpuA1Data(parseMpu(rowsA1 as any)), [rowsA1]);
  useEffect(() => setMpuA2Data(parseMpu(rowsA2 as any)), [rowsA2]);

  // ===== Métricas agregadas por minuto (para Vibração/Runtime do atuador selecionado) =====
  const [aggAct, setAggAct] = useState<MinuteAgg[]>([]);
  const loadAgg = useCallback(async () => {
    try {
      const actLabel = act === 1 ? "A1" : "A2";
      const data = await getMinuteAgg(actLabel as "A1" | "A2", "-2h").catch(() => [] as MinuteAgg[]);
      setAggAct(Array.isArray(data) ? data : []);
    } catch {
      setAggAct([]);
    }
  }, [act]);
  useEffect(() => {
    loadAgg();
    const id = setInterval(loadAgg, VIB_POLL_MS);
    return () => clearInterval(id);
  }, [loadAgg]);

  // ===== Fallback vibração do histórico bruto -> RMS/min (HPF remove gravidade) =====
  const vibClientFallback = useMemo(() => {
    const src = mpuChartData;
    if (!src?.length) return [];
    return rmsByMinute(src);
  }, [mpuChartData]);

  // ===== Dados finais para o gráfico Vibração/Runtime =====
  const vibRtPoints = useMemo(() => {
    const apiPoints = (aggAct ?? [])
      .filter((r) => typeof r.vib_avg === "number" && typeof r.runtime_s === "number")
      .map((r) => ({
        minute: r.minute,
        runtime: r.runtime_s ?? 0,
        vib: minusG(r.vib_avg),
      }));
    if (apiPoints.length) return apiPoints;
    return vibClientFallback;
  }, [aggAct, vibClientFallback]);

  // ===== Unidade e dados escalados (individual) =====
  const vibRtUnit = useMemo<Unit>(() => {
    const maxV = Math.max(0, ...vibRtPoints.map((p) => Number(p.vib ?? 0)));
    return pickUnit(maxV);
  }, [vibRtPoints]);

  const vibRtDisplay = useMemo(() => {
    const u = vibRtUnit;
    return vibRtPoints.map((p) => ({
      ...p,
      vib_disp: scaleByUnit(Number(p.vib ?? 0), u),
    }));
  }, [vibRtPoints, vibRtUnit]);

  // ===== Comparativo A1×A2 por minuto usando RMS (HPF) e grade comum UTC =====
  const comparePerMinute = useMemo(() => {
    const a1 = rmsByMinute(mpuA1Data);
    const a2 = rmsByMinute(mpuA2Data);
    if (!a1.length && !a2.length) return [];

    const mapA1 = new Map(a1.map((r) => [r.minute, r.vib]));
    const mapA2 = new Map(a2.map((r) => [r.minute, r.vib]));

    const allKeys = [...new Set([...mapA1.keys(), ...mapA2.keys()])].sort();
    if (allKeys.length === 0) return [];

    const first = allKeys[0]!;
    const last = allKeys[allKeys.length - 1]!;

    const startMs = Date.parse(first);
    const endMs = Date.parse(last);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];

    const STEP = 60_000;
    const rows: { minute: string; vibA1: number | null; vibA2: number | null }[] = [];
    for (let t = startMs; t <= endMs; t += STEP) {
      const minuteIso = new Date(t).toISOString();
      rows.push({
        minute: minuteIso,
        vibA1: mapA1.has(minuteIso) ? mapA1.get(minuteIso)! : null,
        vibA2: mapA2.has(minuteIso) ? mapA2.get(minuteIso)! : null,
      });
    }
    return rows;
  }, [mpuA1Data, mpuA2Data]);

  // ===== Unidade e dados escalados (comparativo) =====
  const cmpUnit = useMemo<Unit>(() => {
    const maxV = Math.max(
      0,
      ...comparePerMinute.map((p) => Number(p.vibA1 ?? 0)),
      ...comparePerMinute.map((p) => Number(p.vibA2 ?? 0))
    );
    return pickUnit(maxV);
  }, [comparePerMinute]);

  const compareDisplay = useMemo(() => {
    const u = cmpUnit;
    return comparePerMinute.map((p) => ({
      ...p,
      vibA1_disp: p.vibA1 == null ? null : scaleByUnit(Number(p.vibA1), u),
      vibA2_disp: p.vibA2 == null ? null : scaleByUnit(Number(p.vibA2), u),
    }));
  }, [comparePerMinute, cmpUnit]);

  /* ========================= UI ========================= */
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-xl md:text-2xl">Análise de Desempenho</CardTitle>

          {/* Toggle de atuador */}
          <div className="inline-flex rounded-2xl bg-muted/40 p-1 border border-border/60">
            <button
              className={[
                "px-4 py-2 text-sm font-medium rounded-xl transition focus:outline-none",
                act === 1 ? "bg-sky-600 text-white" : "bg-transparent text-foreground/80 hover:text-foreground",
              ].join(" ")}
              onClick={() => setSelectedId(1)}
            >
              Atuador 1
            </button>
            <button
              className={[
                "px-4 py-2 text-sm font-medium rounded-xl transition focus:outline-none",
                act === 2 ? "bg-sky-600 text-white" : "bg-transparent text-foreground/80 hover:text-foreground",
              ].join(" ")}
              onClick={() => setSelectedId(2)}
            >
              Atuador 2
            </button>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="vibracao">
            <TabsList
              className={[
                "flex justify-center overflow-x-auto gap-2 no-scrollbar",
                "sm:grid sm:grid-cols-3 sm:place-items-center",
                "rounded-md p-1 bg-muted/20 w-full",
              ].join(" ")}
            >
              <div className="min-w-[8rem] sm:w-full rounded-md px-3 py-2 opacity-0 text-center select-none hidden sm:block" />
              <TabsTrigger value="vibracao" className="min-w-[8rem] sm:w-full rounded-md px-3 py-2 whitespace-nowrap">
                Vibração
              </TabsTrigger>
              <div className="min-w-[8rem] sm:w-full rounded-md px-3 py-2 opacity-0 text-center select-none hidden sm:block" />
            </TabsList>

            <TabsContent value="vibracao" className="pt-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm">Gráfico:</span>
                <select className="border rounded-md px-2 py-1 bg-background" value={optVib} onChange={(e) => setOptVib(e.target.value as typeof optVib)}>
                  <option value="vib_runtime">Vibração/Runtime (A{act})</option>
                  <option value="vib_compare">Comparativo A1 × A2</option>
                </select>
              </div>

              <div className="h-64 sm:h-72 md:h-80 lg:h-[28rem]">
                <ChartContainer config={{}}>
                  {optVib === "vib_runtime" ? (
                    vibRtDisplay.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={vibRtDisplay}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="minute" tickFormatter={(tick: unknown) => fmtHHMM(tick)} />
                          <YAxis
                            dataKey="vib_disp"
                            domain={[0, "auto"]}
                            label={{
                              value: `Vibração (média/min) [${unitSuffix(vibRtUnit)}]`,
                              angle: -90,
                              position: "insideLeft",
                            }}
                          />
                          <Tooltip
                            content={<ChartTooltipContent />}
                            labelFormatter={(val: unknown) => fmtHHMM(val)}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            formatter={(val: any, name: any): [string, string] => {
                              const n = Number(val);
                              if (name === "vib_disp")
                                return [Number.isFinite(n) ? n.toFixed(3) : "—", `Vibração (${unitSuffix(vibRtUnit)})`];
                              return [String(val), String(name)];
                            }}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="vib_disp" name={`Vibração A${act}`} stroke={act === 1 ? C.A1 : C.A2} dot={false} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm opacity-70">Sem pontos para exibir nesta janela.</div>
                    )
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={compareDisplay}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="minute" tickFormatter={(tick: unknown) => fmtHHMM(tick)} />
                        <YAxis
                          domain={[0, "auto"]}
                          label={{
                            value: `Vibração RMS (avg/min) [${unitSuffix(cmpUnit)}]`,
                            angle: -90,
                            position: "insideLeft",
                          }}
                        />
                        <Tooltip
                          content={<ChartTooltipContent />}
                          labelFormatter={(val: unknown) => fmtHHMM(val)}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(val: any, name: any): [string, string] => {
                            if (val == null) return ["—", String(name)];
                            const n = Number(val);
                            return [Number.isFinite(n) ? n.toFixed(3) : "—", `${String(name)} (${unitSuffix(cmpUnit)})`];
                          }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="vibA1_disp" name="Vib A1 (RMS/min)" stroke={C.A1} dot={false} strokeWidth={2} connectNulls />
                        <Line type="monotone" dataKey="vibA2_disp" name="Vib A2 (RMS/min)" stroke={C.A2} dot={false} strokeWidth={2} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </ChartContainer>
                <div className="text-xs opacity-70 mt-2">Atualiza a cada 60 s · Janela -2h · Atuador A{act}</div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Analytics;
