// src/pages/Analytics.tsx — Bloco 1/3
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar,
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { useMpuIds, useMpuHistory } from "@/hooks/useMpu";
import { getOPCHistory, getMinuteAgg } from "@/lib/api";

// Utils
function toArray<T = any>(x: any): T[] {
  if (Array.isArray(x)) return x as T[];
  if (!x) return [];
  if (typeof x === "object") {
    if (Array.isArray((x as any).ids)) return (x as any).ids as T[];
    return Object.values(x) as T[];
  }
  return [];
}
const toMinuteKey = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

// Paleta consistente
const C = {
  A1: "#7C3AED",
  A2: "#06B6D4",
  RUNTIME_A1: "#16A34A",
  RUNTIME_A2: "#10B981",
  OPEN: "#0EA5E9",
  CLOSE: "#F59E0B",
  CYCLE: "#22D3EE",
};

// Tipos
type CpmPoint = { t: string; A1: number; A2: number };
type MinuteAgg = {
  minute: string;
  t_open_ms_avg: number | null;
  t_close_ms_avg: number | null;
  t_cycle_ms_avg: number | null;
  runtime_s: number;
  cpm: number;
  vib_avg?: number | null;
};
type MpuRowLike = {
  ts?: string; ts_utc?: string; id?: string;
  ax?: number; ay?: number; az?: number;
  ax_g?: number; ay_g?: number; az_g?: number;
  gx?: number; gy?: number; gz?: number;
  gx_dps?: number; gy_dps?: number; gz_dps?: number;
};
type MpuPoint = {
  ts: string;
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
};

const POLL_MS = 15000;

const Analytics: React.FC = () => {
  // ===== Toggle global de atuador (Modelo 1/2) =====
  const [act, setAct] = useState<1 | 2>(1);

  // ===== Seletor de 1 gráfico por guia =====
  type ProducaoOpt = "cpm" | "cpm_runtime" | "cpm_compare";
  type TemposOpt = "t_abre" | "t_fecha" | "t_ciclo" | "runtime" | "tempos_compare";
  type VibraOpt = "accel" | "gyro" | "vib_compare";
  const [optProd, setOptProd] = useState<ProducaoOpt>("cpm");
  const [optTime, setOptTime] = useState<TemposOpt>("t_ciclo");
  const [optVib, setOptVib] = useState<VibraOpt>("accel");

  // ===== IDs de MPU e mapeamento (A1 -> idx 0, A2 -> idx 1) =====
  const { ids } = useMpuIds();
  const idsArray = useMemo<(string | number)[]>(() => toArray(ids), [ids]);
  const mpuA1 = idsArray[0] != null ? String(idsArray[0]) : null;
  const mpuA2 = idsArray[1] != null ? String(idsArray[1]) : null;
  const mpuId = useMemo(() => (act === 1 ? mpuA1 : mpuA2), [act, mpuA1, mpuA2]);

  // ===== Vibração (histórico do BD) + polling =====
  const { rows: rowsAct } = useMpuHistory(mpuId, "-10m", 2000, true);
  const { rows: rowsA1 } = useMpuHistory(mpuA1, "-10m", 2000, true);
  const { rows: rowsA2 } = useMpuHistory(mpuA2, "-10m", 2000, true);

  const parseMpu = (src: unknown[]): MpuPoint[] => {
    const a = Array.isArray(src) ? src : [];
    return a.map((r) => {
      const o = r as MpuRowLike;
      return {
        ts: String(o.ts ?? o.ts_utc ?? ""),
        ax: Number(o.ax ?? o.ax_g ?? 0),
        ay: Number(o.ay ?? o.ay_g ?? 0),
        az: Number(o.az ?? o.az_g ?? 0),
        gx: Number(o.gx ?? o.gx_dps ?? 0),
        gy: Number(o.gy ?? o.gy_dps ?? 0),
        gz: Number(o.gz ?? o.gz_dps ?? 0),
      };
    });
  };

  // série principal (atuador selecionado)
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

  // ===== Produção (CPM 60m via histórico S2) =====
  const [cpmSeries, setCpmSeries] = useState<CpmPoint[]>([]);
  const loadCpm60 = useCallback(async () => {
    const now = Date.now();
    const start = now - 60 * 60 * 1000;
    const keys = Array.from({ length: 60 }, (_, i) => toMinuteKey(new Date(now - (59 - i) * 60000)));
    const buckets = new Map<string, { A1: number; A2: number }>(keys.map((k) => [k, { A1: 0, A2: 0 }]));

    const agg = async (id: 1 | 2, label: "A1" | "A2") => {
      const hist = await getOPCHistory({ actuatorId: id, facet: "S2", since: "-60m", asc: true });
      for (let i = 1; i < hist.length; i++) {
        const prev = Number(hist[i - 1].value);
        const curr = Number(hist[i].value);
        if (prev === 0 && curr === 1) {
          const ts = new Date(hist[i].ts).getTime();
          if (ts >= start) {
            const k = toMinuteKey(new Date(ts));
            const v = buckets.get(k);
            if (v) { v[label] += 1; buckets.set(k, v); }
          }
        }
      }
    };
    await Promise.all([agg(1, "A1"), agg(2, "A2")]);
    setCpmSeries(keys.map((k) => ({ t: k, ...(buckets.get(k) ?? { A1: 0, A2: 0 }) })));
  }, []);
  useEffect(() => { loadCpm60(); const id = setInterval(loadCpm60, POLL_MS); return () => clearInterval(id); }, [loadCpm60]);

  // ===== Métricas agregadas por minuto (Tempos/Runtime/CPM) =====
  const [aggA1, setAggA1] = useState<MinuteAgg[]>([]);
  const [aggA2, setAggA2] = useState<MinuteAgg[]>([]);
  const loadAgg = useCallback(async () => {
    const [a1, a2] = await Promise.all([
      getMinuteAgg("A1", "-60m"),
      getMinuteAgg("A2", "-60m").catch(() => [] as MinuteAgg[]),
    ]);
    setAggA1(Array.isArray(a1) ? a1 : []);
    setAggA2(Array.isArray(a2) ? a2 : []);
  }, []);
  useEffect(() => { loadAgg(); const id = setInterval(loadAgg, POLL_MS); return () => clearInterval(id); }, [loadAgg]);

  const dataAgg = act === 1 ? aggA1 : aggA2;
  const colorAct = act === 1 ? C.A1 : C.A2;
// src/pages/Analytics.tsx — Bloco 2/3
  // ===== UI =====
  return (
    <div className="max-w-[1400px] mx-auto px-2 sm:px-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-2xl">Análise de Desempenho</CardTitle>

          {/* Toggle Segmentado: Modelo 1 / Modelo 2 (A1/A2) */}
          <div className="inline-flex rounded-xl overflow-hidden border border-border">
            <button
              className={[
                "px-4 py-2 text-sm font-medium focus:outline-none",
                act === 1 ? "bg-sky-500 text-white" : "bg-muted text-foreground/90",
              ].join(" ")}
              onClick={() => setAct(1)}
            >
              Modelo 1
            </button>
            <button
              className={[
                "px-4 py-2 text-sm font-medium focus:outline-none",
                act === 2 ? "bg-sky-500 text-white" : "bg-muted text-foreground/90",
              ].join(" ")}
              onClick={() => setAct(2)}
            >
              Modelo 2
            </button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Guias: Produção / Tempos / Vibração */}
          <Tabs defaultValue="producao">
            <TabsList
              className={[
                "flex overflow-x-auto gap-2 no-scrollbar",
                "sm:grid sm:grid-cols-3",
                "rounded-md p-1 bg-muted/20 w-full",
              ].join(" ")}
            >
              <TabsTrigger value="producao" className="min-w-[8rem] sm:w-full rounded-md px-3 py-2 whitespace-nowrap">
                Produção
              </TabsTrigger>
              <TabsTrigger value="tempos" className="min-w-[8rem] sm:w-full rounded-md px-3 py-2 whitespace-nowrap">
                Tempos
              </TabsTrigger>
              <TabsTrigger value="vibracao" className="min-w-[8rem] sm:w-full rounded-md px-3 py-2 whitespace-nowrap">
                Vibração
              </TabsTrigger>
            </TabsList>

            {/* ===================== PRODUÇÃO ===================== */}
            <TabsContent value="producao" className="pt-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm">Gráfico:</span>
                <select
                  className="border rounded-md px-2 py-1 bg-background"
                  value={optProd}
                  onChange={(e) => setOptProd(e.target.value as typeof optProd)}
                >
                  <option value="cpm">CPM por minuto (A{act})</option>
                  <option value="cpm_runtime">CPM × Runtime (A{act})</option>
                  <option value="cpm_compare">Comparativo A1 × A2 (CPM + Runtime)</option>
                </select>
              </div>

              <div className="h-64 sm:h-72 md:h-80 lg:h-[28rem]">
                {(() => {
                  const chartEl =
                    optProd === "cpm" ? (
                      <BarChart
                        data={cpmSeries.map((r) => ({
                          t: r.t,
                          cpm: act === 1 ? r.A1 : r.A2,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="t" />
                        <YAxis allowDecimals={false} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend />
                        <Bar dataKey="cpm" name={`CPM A${act}`} fill={colorAct} />
                      </BarChart>
                    ) : optProd === "cpm_runtime" ? (
                      <BarChart
                        data={dataAgg.map((r) => ({
                          minute: r.minute,
                          cpm: r.cpm,
                          runtime: r.runtime_s,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="minute" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="cpm" name="CPM" fill={colorAct} />
                        <Line yAxisId="right" type="monotone" dataKey="runtime" name="Runtime (s)" stroke={act === 1 ? C.RUNTIME_A1 : C.RUNTIME_A2} dot={false} />
                      </BarChart>
                    ) : (
                      <BarChart
                        data={cpmSeries.map((r) => ({
                          t: r.t,
                          A1: r.A1,
                          A2: r.A2,
                          rtA1: aggA1.find((x) => x.minute.endsWith(r.t))?.runtime_s ?? null,
                          rtA2: aggA2.find((x) => x.minute.endsWith(r.t))?.runtime_s ?? null,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="t" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="A1" name="CPM A1" fill={C.A1} />
                        <Bar yAxisId="left" dataKey="A2" name="CPM A2" fill={C.A2} />
                        <Line yAxisId="right" type="monotone" dataKey="rtA1" name="Runtime A1 (s)" stroke={C.RUNTIME_A1} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="rtA2" name="Runtime A2 (s)" stroke={C.RUNTIME_A2} dot={false} />
                      </BarChart>
                    );

                  return <ChartContainer config={{}}>{chartEl}</ChartContainer>;
                })()}
              </div>
            </TabsContent>

            {/* ===================== TEMPOS ===================== */}
            <TabsContent value="tempos" className="pt-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm">Gráfico:</span>
                <select
                  className="border rounded-md px-2 py-1 bg-background"
                  value={optTime}
                  onChange={(e) => setOptTime(e.target.value as typeof optTime)}
                >
                  <option value="t_abre">TAbre (A{act})</option>
                  <option value="t_fecha">TFecha (A{act})</option>
                  <option value="t_ciclo">TCiclo (A{act})</option>
                  <option value="runtime">Runtime (A{act})</option>
                  <option value="tempos_compare">Comparativo A1 × A2 (TCiclo + Runtime)</option>
                </select>
              </div>

              <div className="h-64 sm:h-72 md:h-80 lg:h-[28rem]">
                <ChartContainer config={{}}>
                  {optTime !== "tempos_compare" ? (
                    <LineChart
                      data={dataAgg.map((r) => ({
                        minute: r.minute,
                        to: r.t_open_ms_avg,
                        tf: r.t_close_ms_avg,
                        tc: r.t_cycle_ms_avg,
                        runtime: r.runtime_s,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="minute" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend />

                      {optTime === "t_abre" && (
                        <Line yAxisId="left" type="monotone" dataKey="to" name="TAbre (ms)" stroke={C.OPEN} dot={false} />
                      )}
                      {optTime === "t_fecha" && (
                        <Line yAxisId="left" type="monotone" dataKey="tf" name="TFecha (ms)" stroke={C.CLOSE} dot={false} />
                      )}
                      {optTime === "t_ciclo" && (
                        <Line yAxisId="left" type="monotone" dataKey="tc" name="TCiclo (ms)" stroke={C.CYCLE} dot={false} />
                      )}
                      {optTime === "runtime" && (
                        <Line yAxisId="right" type="monotone" dataKey="runtime" name="Runtime (s)" stroke={act === 1 ? C.RUNTIME_A1 : C.RUNTIME_A2} dot={false} />
                      )}
                      {optTime !== "runtime" && (
                        <Line yAxisId="right" type="monotone" dataKey="runtime" name="Runtime (s)" stroke={act === 1 ? C.RUNTIME_A1 : C.RUNTIME_A2} dot={false} />
                      )}
                    </LineChart>
                  ) : (
                    <LineChart
                      data={(() => {
                        const m = new Map<string, { minute: string; tcA1?: number | null; tcA2?: number | null; rtA1?: number; rtA2?: number }>();
                        for (const r of aggA1) m.set(r.minute, { minute: r.minute, tcA1: r.t_cycle_ms_avg, rtA1: r.runtime_s });
                        for (const r of aggA2) {
                          const prev = m.get(r.minute) ?? { minute: r.minute };
                          m.set(r.minute, { ...prev, tcA2: r.t_cycle_ms_avg, rtA2: r.runtime_s });
                        }
                        return Array.from(m.values()).sort((a, b) => a.minute.localeCompare(b.minute));
                      })()}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="minute" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="tcA1" name="TCiclo A1 (ms)" stroke={C.A1} dot={false} />
                      <Line yAxisId="left" type="monotone" dataKey="tcA2" name="TCiclo A2 (ms)" stroke={C.A2} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="rtA1" name="Runtime A1 (s)" stroke={C.RUNTIME_A1} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="rtA2" name="Runtime A2 (s)" stroke={C.RUNTIME_A2} dot={false} />
                    </LineChart>
                  )}
                </ChartContainer>
              </div>
            </TabsContent>
            {/* ===================== VIBRAÇÃO ===================== */}
            <TabsContent value="vibracao" className="pt-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm">Gráfico:</span>
                <select
                  className="border rounded-md px-2 py-1 bg-background"
                  value={optVib}
                  onChange={(e) => setOptVib(e.target.value as typeof optVib)}
                >
                  <option value="accel">Aceleração (A{act})</option>
                  <option value="gyro">Giro (A{act})</option>
                  <option value="vib_compare">Comparativo A1 × A2 (ax)</option>
                </select>
              </div>

              <div className="h-64 sm:h-72 md:h-80 lg:h-[28rem]">
                <ChartContainer config={{}}>
                  {optVib !== "vib_compare" ? (
                    <LineChart data={mpuChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="ts" />
                      <YAxis />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend />

                      {optVib === "accel" && (
                        <>
                          <Line type="monotone" dataKey="ax" name="ax (g)" stroke="#4f46e5" dot={false} />
                          <Line type="monotone" dataKey="ay" name="ay (g)" stroke="#0ea5e9" dot={false} />
                          <Line type="monotone" dataKey="az" name="az (g)" stroke="#22d3ee" dot={false} />
                        </>
                      )}
                      {optVib === "gyro" && (
                        <>
                          <Line type="monotone" dataKey="gx" name="gx (dps)" stroke="#f43f5e" dot={false} />
                          <Line type="monotone" dataKey="gy" name="gy (dps)" stroke="#f97316" dot={false} />
                          <Line type="monotone" dataKey="gz" name="gz (dps)" stroke="#84cc16" dot={false} />
                        </>
                      )}
                    </LineChart>
                  ) : (
                    <LineChart
                      data={(() => {
                        const m = new Map<string, { ts: string; axA1?: number; axA2?: number }>();
                        for (const p of mpuA1Data) m.set(p.ts, { ts: p.ts, axA1: p.ax });
                        for (const p of mpuA2Data) {
                          const prev = m.get(p.ts) ?? { ts: p.ts };
                          m.set(p.ts, { ...prev, axA2: p.ax });
                        }
                        return Array.from(m.values()).sort((a, b) => a.ts.localeCompare(b.ts));
                      })()}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="ts" />
                      <YAxis />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Line type="monotone" dataKey="axA1" name="ax A1 (g)" stroke={C.A1} dot={false} />
                      <Line type="monotone" dataKey="axA2" name="ax A2 (g)" stroke={C.A2} dot={false} />
                    </LineChart>
                  )}
                </ChartContainer>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Analytics;
