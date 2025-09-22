// src/pages/Analytics.tsx (parte 1)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
// ❌ Removido: import Layout from "@/components/Layout";
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
  BarChart,
  Bar,
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

// Hooks
import { useMpuIds, useMpuHistory, useMpuStream } from "@/hooks/useMpu";
// import { useOpcStream } from "@/hooks/useOpcStream"; // não usado aqui

// API
import { getOPCHistory, getMinuteAgg } from "@/lib/api";

// helper genérico (normaliza para array)
function toArray<T = any>(x: any): T[] {
  if (Array.isArray(x)) return x as T[];
  if (!x) return [];
  if (typeof x === "object") {
    if (Array.isArray((x as any).ids)) return (x as any).ids as T[];
    return Object.values(x) as T[];
  }
  return [];
}

// ---------- Tipos ----------
type CpmPoint = { t: string; A1: number; A2: number };
type MpuPoint = { ts: string; ax: number; ay: number; az: number };
type MpuRowLike = {
  ts?: string;
  ts_utc?: string;
  ax?: number;
  ay?: number;
  az?: number;
  ax_g?: number;
  ay_g?: number;
  az_g?: number;
};
type MpuStreamEvt = { id?: string; ts?: string; ax?: number; ay?: number; az?: number } | null;
type MinuteAgg = {
  minute: string;
  t_open_ms_avg: number | null;
  t_close_ms_avg: number | null;
  t_cycle_ms_avg: number | null;
  runtime_s: number;
  cpm: number;
  vib_avg?: number | null;
};

// ---------- helpers ----------
const toMinuteKey = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

// ==============================
// Componente
// ==============================
const Analytics: React.FC = () => {
  // ===== MPU (ids, histórico 5m, stream) =====
  const { ids } = useMpuIds();
  const idsArray = useMemo<(string | number)[]>(() => toArray(ids), [ids]);
  const [mpuId, setMpuId] = useState<string | null>(null);

  useEffect(() => {
    if (!mpuId && idsArray.length) setMpuId(String(idsArray[0]));
  }, [idsArray, mpuId]);

  const { rows } = useMpuHistory(mpuId, "-5m", 1000, true);
  const { last } = useMpuStream({ id: mpuId || undefined });

  const mpuSeriesRef = useRef<MpuPoint[]>([]);
  const [mpuChartData, setMpuChartData] = useState<MpuPoint[]>([]);

  useEffect(() => {
    const src: ReadonlyArray<unknown> = Array.isArray(rows) ? rows : [];
    const normalized: MpuPoint[] = src.map((r) => {
      const o = r as MpuRowLike;
      return {
        ts: String(o.ts ?? o.ts_utc ?? ""),
        ax: Number(o.ax ?? o.ax_g ?? 0),
        ay: Number(o.ay ?? o.ay_g ?? 0),
        az: Number(o.az ?? o.az_g ?? 0),
      };
    });
    mpuSeriesRef.current = normalized;
    setMpuChartData(normalized);
  }, [rows]);

  useEffect(() => {
    const evt: MpuStreamEvt = last;
    if (!evt || !mpuId || evt.id !== mpuId) return;
    const point: MpuPoint = {
      ts: String(evt.ts ?? new Date().toISOString()),
      ax: Number(evt.ax ?? 0),
      ay: Number(evt.ay ?? 0),
      az: Number(evt.az ?? 0),
    };
    mpuSeriesRef.current = [...mpuSeriesRef.current, point].slice(-1200);
    setMpuChartData(mpuSeriesRef.current);
  }, [last, mpuId]);

  // ===== Production (CPM 60m, comparativo A1/A2) =====
  const [cpmSeries, setCpmSeries] = useState<CpmPoint[]>([]);
  const [showA1, setShowA1] = useState(true);
  const [showA2, setShowA2] = useState(true);

  const loadCpm60 = useCallback(async () => {
    const now = Date.now();
    const start = now - 60 * 60 * 1000;
    const keys = Array.from({ length: 60 }, (_, i) =>
      toMinuteKey(new Date(now - (59 - i) * 60000))
    );
// src/pages/Analytics.tsx (parte 2)
    const buckets = new Map<string, { A1: number; A2: number }>(
      keys.map((k) => [k, { A1: 0, A2: 0 }])
    );

    const agg = async (id: 1 | 2, label: "A1" | "A2") => {
      const hist = await getOPCHistory({
        actuatorId: id,
        facet: "S2",
        since: "-60m",
        asc: true,
      });
      for (let i = 1; i < hist.length; i++) {
        const prev = Number(hist[i - 1].value);
        const curr = Number(hist[i].value);
        if (prev === 0 && curr === 1) {
          const ts = new Date(hist[i].ts).getTime();
          if (ts >= start) {
            const k = toMinuteKey(new Date(ts));
            const v = buckets.get(k);
            if (v) {
              v[label] += 1;
              buckets.set(k, v);
            }
          }
        }
      }
    };

    await Promise.all([agg(1, "A1"), agg(2, "A2")]);
    setCpmSeries(keys.map((k) => ({ t: k, ...(buckets.get(k) ?? { A1: 0, A2: 0 }) })));
  }, []);

  useEffect(() => {
    loadCpm60();
  }, [loadCpm60]);

  // ===== Operational Time: Runtime × Nº de Ciclos (por atuador) =====
  const [opAct, setOpAct] = useState<1 | 2>(1);
  const [aggA1, setAggA1] = useState<MinuteAgg[]>([]);
  const [aggA2, setAggA2] = useState<MinuteAgg[]>([]);

  useEffect(() => {
    (async () => {
      const [a1, a2] = await Promise.all([
        getMinuteAgg("A1", "-60m"),
        getMinuteAgg("A2", "-60m").catch(() => [] as MinuteAgg[]),
      ]);
      setAggA1(Array.isArray(a1) ? a1 : []);
      setAggA2(Array.isArray(a2) ? a2 : []);
    })();
  }, []);

  // ===== Metrics (usuário escolhe gráfico) =====
  type MetricChoice =
    | "vib_x_open"
    | "vib_x_close"
    | "vib_x_runtime"
    | "times_x_runtime"
    | "a1xa2_cpm_runtime";
  const [metricChoice, setMetricChoice] = useState<MetricChoice>("vib_x_open");

  const joined = useMemo(() => {
    const m = new Map<string, { minute: string; a1?: MinuteAgg; a2?: MinuteAgg }>();
    for (const r of aggA1) m.set(r.minute, { minute: r.minute, a1: r });
    for (const r of aggA2) {
      const prev = m.get(r.minute) ?? { minute: r.minute };
      m.set(r.minute, { ...prev, a2: r });
    }
    return Array.from(m.values()).sort((a, b) => a.minute.localeCompare(b.minute));
  }, [aggA1, aggA2]);

  // =================== UI ===================
  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12">
        <Card>
          <CardHeader>
            <CardTitle>Performance Analytics</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="production">
              <TabsList className="grid w-full grid-cols-3 md:grid-cols-4">
                <TabsTrigger value="production">Production</TabsTrigger>
                <TabsTrigger value="operational">Operational Time</TabsTrigger>
                <TabsTrigger value="mpu">MPU</TabsTrigger>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
              </TabsList>

              {/* Production: CPM por minuto (barras) + seleção de A1/A2 */}
              <TabsContent value="production" className="pt-4">
                <div className="flex items-center gap-4 mb-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showA1}
                      onChange={(e) => setShowA1(e.target.checked)}
                    />
                    AT1
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showA2}
                      onChange={(e) => setShowA2(e.target.checked)}
                    />
                    AT2
                  </label>
                </div>
                <div className="h-80">
                  <ChartContainer className="h-full" config={{}}>
                    <BarChart data={cpmSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="t" />
                      <YAxis allowDecimals={false} />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Bar dataKey="A1" name="AT1 CPM" fill="#4f46e5" hide={!showA1} />
                      <Bar dataKey="A2" name="AT2 CPM" fill="#0ea5e9" hide={!showA2} />
                    </BarChart>
                  </ChartContainer>
                </div>
              </TabsContent>

              {/* Operational Time: Runtime × Nº de Ciclos (atuador escolhido) */}
              <TabsContent value="operational" className="pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm">Actuator:</span>
                  <select
                    className="border rounded-md px-2 py-1 bg-background"
                    value={opAct}
                    onChange={(e) => setOpAct(Number(e.target.value) as 1 | 2)}
                  >
                    <option value={1}>AT1</option>
                    <option value={2}>AT2</option>
                  </select>
                </div>
                <div className="h-80">
                  <ChartContainer className="h-full" config={{}}>
                    <LineChart
                      data={(opAct === 1 ? aggA1 : aggA2).map((r) => ({
                        minute: r.minute,
                        cycles: r.cpm,
                        runtime: r.runtime_s,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="minute" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="cycles"
                        name="Cycles/min"
                        stroke="#4f46e5"
                        dot={false}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="runtime"
                        name="Runtime (s)"
                        stroke="#16a34a"
                        dot={false}
                      />
                    </LineChart>
                  </ChartContainer>
                </div>
              </TabsContent>
// src/pages/Analytics.tsx (parte 3)
              {/* MPU */}
              <TabsContent value="mpu" className="pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm">MPU:</span>
                  <select
                    className="border rounded-md px-2 py-1 bg-background"
                    value={mpuId ?? ""}
                    onChange={(e) => setMpuId(e.target.value || null)}
                  >
                    {idsArray.map((id) => {
                      const sid = String(id);
                      return (
                        <option key={sid} value={sid}>
                          {sid}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="h-80">
                  <ChartContainer className="h-full" config={{}}>
                    <LineChart data={mpuChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="ts" />
                      <YAxis />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="ax"
                        stroke="#4f46e5"
                        strokeWidth={2}
                        name="ax (g)"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="ay"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        name="ay (g)"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="az"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        name="az (g)"
                        dot={false}
                      />
                    </LineChart>
                  </ChartContainer>
                </div>
              </TabsContent>

              {/* Metrics: usuário escolhe qual gráfico gerar */}
              <TabsContent value="metrics" className="pt-4">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="text-sm">Gráfico:</span>
                  <select
                    className="border rounded-md px-2 py-1 bg-background"
                    value={metricChoice}
                    onChange={(e) => setMetricChoice(e.target.value as typeof metricChoice)}
                  >
                    <option value="vib_x_open">Vib × TAbre</option>
                    <option value="vib_x_close">Vib × TFecha</option>
                    <option value="vib_x_runtime">Vib × Runtime</option>
                    <option value="times_x_runtime">TAbre/TFecha/TCiclo × Runtime</option>
                    <option value="a1xa2_cpm_runtime">A1×A2 — CPM & Runtime</option>
                  </select>
                </div>
                <div className="h-80">
                  <ChartContainer className="h-full" config={{}}>
                    {metricChoice === "a1xa2_cpm_runtime" ? (
                      <BarChart
                        data={joined.map((r) => ({
                          minute: r.minute,
                          cpm_A1: r.a1?.cpm ?? 0,
                          cpm_A2: r.a2?.cpm ?? 0,
                          rt_A1: r.a1?.runtime_s ?? 0,
                          rt_A2: r.a2?.runtime_s ?? 0,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="minute" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="cpm_A1" name="CPM A1" fill="#4f46e5" />
                        <Bar yAxisId="left" dataKey="cpm_A2" name="CPM A2" fill="#0ea5e9" />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="rt_A1"
                          name="Runtime A1 (s)"
                          stroke="#16a34a"
                          dot={false}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="rt_A2"
                          name="Runtime A2 (s)"
                          stroke="#f59e0b"
                          dot={false}
                        />
                      </BarChart>
                    ) : (
                      <LineChart
                        data={joined.map((r) => ({
                          minute: r.minute,
                          vib_A1: r.a1?.vib_avg ?? null,
                          vib_A2: r.a2?.vib_avg ?? null,
                          to_A1: r.a1?.t_open_ms_avg ?? null,
                          to_A2: r.a2?.t_open_ms_avg ?? null,
                          tf_A1: r.a1?.t_close_ms_avg ?? null,
                          tf_A2: r.a2?.t_close_ms_avg ?? null,
                          tc_A1: r.a1?.t_cycle_ms_avg ?? null,
                          tc_A2: r.a2?.t_cycle_ms_avg ?? null,
                          rt_A1: r.a1?.runtime_s ?? 0,
                          rt_A2: r.a2?.runtime_s ?? 0,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="minute" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend />
                        {/* As quatro variantes de gráfico */}
                        {/* vib_x_open */}
                        {metricChoice === "vib_x_open" && (
                          <>
                            <Line yAxisId="left" type="monotone" dataKey="vib_A1" name="Vib A1" stroke="#4f46e5" dot={false} />
                            <Line yAxisId="left" type="monotone" dataKey="vib_A2" name="Vib A2" stroke="#16a34a" dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="to_A1" name="TAbre A1 (ms)" stroke="#0ea5e9" dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="to_A2" name="TAbre A2 (ms)" stroke="#f59e0b" dot={false} />
                          </>
                        )}

                        {/* vib_x_close */}
                        {metricChoice === "vib_x_close" && (
                          <>
                            <Line yAxisId="left" type="monotone" dataKey="vib_A1" name="Vib A1" stroke="#4f46e5" dot={false} />
                            <Line yAxisId="left" type="monotone" dataKey="vib_A2" name="Vib A2" stroke="#16a34a" dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="tf_A1" name="TFecha A1 (ms)" stroke="#0ea5e9" dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="tf_A2" name="TFecha A2 (ms)" stroke="#f59e0b" dot={false} />
                          </>
                        )}

                        {/* vib_x_runtime */}
                        {metricChoice === "vib_x_runtime" && (
                          <>
                            <Line yAxisId="left" type="monotone" dataKey="vib_A1" name="Vib A1" stroke="#4f46e5" dot={false} />
                            <Line yAxisId="left" type="monotone" dataKey="vib_A2" name="Vib A2" stroke="#16a34a" dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="rt_A1" name="Runtime A1 (s)" stroke="#0ea5e9" dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="rt_A2" name="Runtime A2 (s)" stroke="#f59e0b" dot={false} />
                          </>
                        )}

                        {/* times_x_runtime */}
                        {metricChoice === "times_x_runtime" && (
                          <>
                            <Line yAxisId="left" type="monotone" dataKey="to_A1" name="TAbre A1 (ms)" stroke="#4f46e5" dot={false} />
                            <Line yAxisId="left" type="monotone" dataKey="tf_A1" name="TFecha A1 (ms)" stroke="#0ea5e9" dot={false} />
                            <Line yAxisId="left" type="monotone" dataKey="tc_A1" name="TCiclo A1 (ms)" stroke="#22d3ee" dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="rt_A1" name="Runtime A1 (s)" stroke="#16a34a" dot={false} />
                            <Line yAxisId="left" type="monotone" dataKey="to_A2" name="TAbre A2 (ms)" stroke="#f59e0b" dot={false} />
                            <Line yAxisId="left" type="monotone" dataKey="tf_A2" name="TFecha A2 (ms)" stroke="#a855f7" dot={false} />
                            <Line yAxisId="left" type="monotone" dataKey="tc_A2" name="TCiclo A2 (ms)" stroke="#ea580c" dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="rt_A2" name="Runtime A2 (s)" stroke="#10b981" dot={false} />
                          </>
                        )}
                      </LineChart>
                    )}
                  </ChartContainer>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Analytics;
