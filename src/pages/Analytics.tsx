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
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { useMpuIds, useMpuHistory } from "@/hooks/useMpu";
import { getMinuteAgg } from "@/lib/api";

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

const toMinuteIsoUTC = (d: Date) =>
  new Date(
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

// subtrai 1g (gravidade) dos valores de vibração
const minusG = (v: number | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n - 1 : 0;
};

// módulo da aceleração e subtrai 1g (clamp >= 0)
const magMinusG = (ax?: number, ay?: number, az?: number) => {
  const x = Number(ax ?? 0), y = Number(ay ?? 0), z = Number(az ?? 0);
  const mag = Math.sqrt(x * x + y * y + z * z);
  const v = mag - 1;
  return v > 0 ? v : 0;
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
const VIB_POLL_MS = 60000;

/* ========================= Página ========================= */
const Analytics: React.FC = () => {
  // ===== Toggle global de atuador (Modelo 1/2) =====
  const [act, setAct] = useState<1 | 2>(1);

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
        ax: Number(o.ax ?? o.ax_g ?? 0),
        ay: Number(o.ay ?? o.ay_g ?? 0),
        az: Number(o.az ?? o.az_g ?? 0),
        gx: Number(o.gx ?? o.gx_dps ?? 0),
        gy: Number(o.gy ?? o.gy_dps ?? 0),
        gz: Number(o.gz ?? o.gz_dps ?? 0),
      };
    });
  };

  // série principal (atuador selecionado) — para fallback de vib média/min
  const actMpuRef = useRef<MpuPoint[]>([]);
  const [mpuChartData, setMpuChartData] = useState<MpuPoint[]>([]);
  useEffect(() => {
    const normalized = parseMpu(rowsAct as any);
    const byTs = new Map<string, MpuPoint>();
    for (const p of [...actMpuRef.current, ...normalized]) byTs.set(p.ts, p);
    const merged = Array.from(byTs.values())
      .sort((a, b) => a.ts.localeCompare(b.ts))
      .slice(-2000);
    actMpuRef.current = merged;
    setMpuChartData(merged);
  }, [rowsAct]);

  // séries para comparação (A1 × A2)
  const [mpuA1Data, setMpuA1Data] = useState<MpuPoint[]>([]);
  const [mpuA2Data, setMpuA2Data] = useState<MpuPoint[]>([]);
  useEffect(() => setMpuA1Data(parseMpu(rowsA1 as any)), [rowsA1]);
  useEffect(() => setMpuA2Data(parseMpu(rowsA2 as any)), [rowsA2]);

  // ===== Métricas agregadas por minuto (para Vibração/Runtime) =====
  const [aggAct, setAggAct] = useState<MinuteAgg[]>([]);
  const loadAgg = useCallback(async () => {
    const actLabel = act === 1 ? "A1" : "A2";
    const data = await getMinuteAgg(actLabel as "A1" | "A2", "-2h").catch(
      () => [] as MinuteAgg[]
    );
    setAggAct(Array.isArray(data) ? data : []);
  }, [act]);
  useEffect(() => {
    loadAgg();
    const id = setInterval(loadAgg, VIB_POLL_MS);
    return () => clearInterval(id);
  }, [loadAgg]);

  // ===== Fallback vibração do histórico bruto (média/min) =====
  const vibClientFallback = useMemo(() => {
    const src = mpuChartData;
    if (!src?.length) return [];
    const byMin = new Map<string, { sum: number; n: number }>();
    for (const p of src) {
      const t = new Date(p.ts);
      const minuteIso = toMinuteIsoUTC(t);
      const ax = Number(p.ax ?? 0),
        ay = Number(p.ay ?? 0),
        az = Number(p.az ?? 0);
      // módulo do vetor -> média por minuto, depois subtrai 1g
      const mag = Math.sqrt(ax * ax + ay * ay + az * az);
      const acc = byMin.get(minuteIso) ?? { sum: 0, n: 0 };
      acc.sum += mag;
      acc.n += 1;
      byMin.set(minuteIso, acc);
    }
    const out: { minute: string; vib: number; runtime: number }[] = [];
    for (const [minute, v] of byMin) {
      const avg = v.n ? v.sum / v.n : 0;
      out.push({ minute, vib: avg - 1, runtime: 0 }); // <— subtrai 1g
    }
    return out.sort((a, b) => a.minute.localeCompare(b.minute));
  }, [mpuChartData]);

  // ===== Dados finais para o gráfico Vibração/Runtime (subtraindo 1g)
  const vibRtPoints = useMemo(() => {
    const apiPoints = (aggAct ?? [])
      .filter(
        (r) => typeof r.vib_avg === "number" && typeof r.runtime_s === "number"
      )
      .map((r) => ({
        minute: r.minute,              // eixo X por tempo
        runtime: r.runtime_s ?? 0,     // mantemos no payload (se quiser usar depois)
        vib: minusG(r.vib_avg),        // vib média/min - 1g
      }));
    if (apiPoints.length) return apiPoints;

    // usa fallback local (já -1g), também por minuto
    return vibClientFallback;
  }, [aggAct, vibClientFallback]);

  // ===== Comparativo A1×A2 agregado por minuto (|a|-1g, média a cada 60s) =====
  const comparePerMinute = useMemo(() => {
    // agrega por minuto para A1
    const aggA1 = new Map<string, { sum: number; n: number }>();
    for (const p of mpuA1Data) {
      const minute = toMinuteIsoUTC(new Date(p.ts));
      const val = magMinusG(p.ax, p.ay, p.az);
      const acc = aggA1.get(minute) ?? { sum: 0, n: 0 };
      acc.sum += val; acc.n += 1;
      aggA1.set(minute, acc);
    }
    // agrega por minuto para A2
    const aggA2 = new Map<string, { sum: number; n: number }>();
    for (const p of mpuA2Data) {
      const minute = toMinuteIsoUTC(new Date(p.ts));
      const val = magMinusG(p.ax, p.ay, p.az);
      const acc = aggA2.get(minute) ?? { sum: 0, n: 0 };
      acc.sum += val; acc.n += 1;
      aggA2.set(minute, acc);
    }
    // une o conjunto de minutos e calcula média
    const minutes = new Set<string>([
      ...Array.from(aggA1.keys()),
      ...Array.from(aggA2.keys()),
    ]);
    const rows: { minute: string; vibA1?: number; vibA2?: number }[] = [];
    for (const m of minutes) {
      const a1 = aggA1.get(m);
      const a2 = aggA2.get(m);
      rows.push({
        minute: m,
        vibA1: a1 && a1.n ? a1.sum / a1.n : undefined,
        vibA2: a2 && a2.n ? a2.sum / a2.n : undefined,
      });
    }
    rows.sort((a, b) => a.minute.localeCompare(b.minute));
    return rows;
  }, [mpuA1Data, mpuA2Data]);

  /* ========================= UI ========================= */
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {/* título com tamanho levemente maior (ajuste de estilo) */}
          <CardTitle className="text-xl md:text-2xl">Análise de Desempenho</CardTitle>

          {/* Toggle com estilo um pouco mais “pill” (ajuste de estilo) */}
          <div className="inline-flex rounded-2xl bg-muted/40 p-1 border border-border/60">
            <button
              className={[
                "px-4 py-2 text-sm font-medium rounded-xl transition focus:outline-none",
                act === 1 ? "bg-sky-600 text-white" : "bg-transparent text-foreground/80 hover:text-foreground",
              ].join(" ")}
              onClick={() => setAct(1)}
            >
              Modelo 1
            </button>
            <button
              className={[
                "px-4 py-2 text-sm font-medium rounded-xl transition focus:outline-none",
                act === 2 ? "bg-sky-600 text-white" : "bg-transparent text-foreground/80 hover:text-foreground",
              ].join(" ")}
              onClick={() => setAct(2)}
            >
              Modelo 2
            </button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Guias: somente Vibração (mantém layout do remoto) */}
          <Tabs defaultValue="vibracao">
            <TabsList
              className={[
                "flex justify-center overflow-x-auto gap-2 no-scrollbar",
                "sm:grid sm:grid-cols-3 sm:place-items-center",
                "rounded-md p-1 bg-muted/20 w-full",
              ].join(" ")}
            >
              {/* placeholders para centralizar o trigger, igual ao remoto */}
              <div className="min-w-[8rem] sm:w-full rounded-md px-3 py-2 opacity-0 text-center select-none hidden sm:block" />
              <TabsTrigger
                value="vibracao"
                className="min-w-[8rem] sm:w-full rounded-md px-3 py-2 whitespace-nowrap"
              >
                Vibração
              </TabsTrigger>
              <div className="min-w-[8rem] sm:w-full rounded-md px-3 py-2 opacity-0 text-center select-none hidden sm:block" />
            </TabsList>

            {/* ===================== VIBRAÇÃO ===================== */}
            <TabsContent value="vibracao" className="pt-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm">Gráfico:</span>
                <select
                  className="border rounded-md px-2 py-1 bg-background"
                  value={optVib}
                  onChange={(e) =>
                    setOptVib(e.target.value as typeof optVib)
                  }
                >
                  <option value="vib_runtime">Vibração/Runtime (A{act})</option>
                  <option value="vib_compare">Comparativo A1 × A2</option>
                </select>
              </div>

              <div className="h-64 sm:h-72 md:h-80 lg:h-[28rem]">
                <ChartContainer config={{}}>
                  {optVib === "vib_runtime" ? (
                    vibRtPoints.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={vibRtPoints}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="minute"
                            tickFormatter={(iso: string) =>
                              new Date(iso).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              })
                            }
                          />
                          <YAxis
                            dataKey="vib"
                            label={{
                              value: "Vibração (média/min) - 1g",
                              angle: -90,
                              position: "insideLeft",
                            }}
                          />
                          <Tooltip
                            content={<ChartTooltipContent />}
                            labelFormatter={(iso: string) =>
                              new Date(iso).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              })
                            }
                            formatter={(val: number, name) =>
                              name === "vib"
                                ? [`${val.toFixed(3)}`, "Vibração (avg) - 1g"]
                                : [String(val), name]
                            }
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="vib"
                            name={`Vibração A${act} (-1g)`}
                            stroke={act === 1 ? C.A1 : C.A2}
                            dot={false}
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm opacity-70">
                        Sem pontos para exibir nesta janela.
                      </div>
                    )
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={comparePerMinute}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="minute"
                          tickFormatter={(iso: string) =>
                            new Date(iso).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })
                          }
                        />
                        <YAxis />
                        <Tooltip
                          content={<ChartTooltipContent />}
                          labelFormatter={(iso: string) =>
                            new Date(iso).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })
                          }
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="vibA1"
                          name="Vib A1 (avg/min, |a|-1g)"
                          stroke={C.A1}
                          dot={false}
                          strokeWidth={2}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="vibA2"
                          name="Vib A2 (avg/min, |a|-1g)"
                          stroke={C.A2}
                          dot={false}
                          strokeWidth={2}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </ChartContainer>
                <div className="text-xs opacity-70 mt-2">
                  Atualiza a cada 60 s · Janela -2h · Atuador A{act}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Analytics;
