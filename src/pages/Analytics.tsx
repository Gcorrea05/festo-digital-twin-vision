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
import {
  getMinuteAgg,
  openAnalyticsWS,
  type WSMessageAnalyticsMinuteAgg,
  // WS novo para média/min
  openGraficoWS,
  type WSMessageGrafico,
} from "@/lib/api";
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

// ---- helpers de tempo ----
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
  const d = new Date(String(val ?? ""));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
};

/* ========================= Paleta ========================= */
const C = { A1: "#7C3AED", A2: "#06B6D4" };

/* ========================= Constantes ========================= */
const WINDOW_MINUTES = 10; // <- janela fixa
const WINDOW_SINCE = "-10m";
const MAX_MIN = WINDOW_MINUTES + 1;

const withinWindow = (minuteIso: string) =>
  Date.parse(minuteIso) >= Date.now() - WINDOW_MINUTES * 60_000;

/* ========================= Tipos locais ========================= */
type MinuteAgg = { minute: string; runtime_s: number; vib_avg?: number | null };

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
type MpuPoint = { ts: string; ax: number; ay: number; az: number };

// Pontos do /ws/grafico
type GrafPoint = {
  minute: string;    // HH:mm (apenas para exibir)
  minuteIso: string; // ISO original com -03:00
  avg: number;
  empty: boolean;
  count: number;
};

/* ===== Conversão RAW->g ===== */
const RAW_TO_G = 1 / 16384;
const pickG = (g?: number, raw?: number) =>
  Number.isFinite(g as number) ? Number(g) : Number.isFinite(raw as number) ? Number(raw) * RAW_TO_G : 0;

/* ===== Média de vibração por minuto (fallback cliente) =====
   vib = max(0, sqrt(ax^2+ay^2+az^2) - 1) */
function avgVibrationByMinute(points: { ts: string; ax: number; ay: number; az: number }[]) {
  const byMin = new Map<string, { sum: number; n: number }>();
  for (const p of points) {
    const m = toMinuteIsoUTC(p.ts);
    const mag = Math.sqrt(p.ax * p.ax + p.ay * p.ay + p.az * p.az);
    const vib = Math.max(0, mag - 1);
    const acc = byMin.get(m) ?? { sum: 0, n: 0 };
    acc.sum += vib;
    acc.n += 1;
    byMin.set(m, acc);
  }
  const out: { minute: string; vib: number }[] = [];
  for (const [minute, v] of byMin) {
    if (!withinWindow(minute)) continue; // corta fora da janela
    out.push({ minute, vib: v.n ? v.sum / v.n : 0 });
  }
  return out.sort((a, b) => a.minute.localeCompare(b.minute)).slice(-MAX_MIN);
}

/* ===== Unidade dinâmica ===== */
type Unit = "g" | "mg" | "µg";
const pickUnit = (maxG: number): Unit =>
  !isFinite(maxG) || maxG <= 0 ? "g" : maxG >= 0.1 ? "g" : maxG >= 0.001 ? "mg" : "µg";
const scaleByUnit = (v: number, u: Unit) => (u === "g" ? v : u === "mg" ? v * 1_000 : v * 1_000_000);
const unitSuffix = (u: Unit) => (u === "g" ? "g" : u === "mg" ? "mg" : "µg");

/* ========================= Página ========================= */
const Analytics: React.FC = () => {
  const { selectedId: act, setSelectedId } = useActuatorSelection();

  type VibraOpt = "vib_runtime" | "vib_compare";
  const [optVib, setOptVib] = useState<VibraOpt>("vib_runtime");

  // IDs de MPU
  const { ids } = useMpuIds();
  const idsArray = useMemo<(string | number)[]>(() => toArray(ids), [ids]);
  const mpuA1 = idsArray[0] != null ? String(idsArray[0]) : null;
  const mpuA2 = idsArray[1] != null ? String(idsArray[1]) : null;
  const mpuId = useMemo(() => (act === 1 ? mpuA1 : mpuA2), [act, mpuA1, mpuA2]);

  // Histórico bruto (já pedimos –10m no hook)
  const { rows: rowsAct } = useMpuHistory(mpuId, WINDOW_SINCE, 2000, true);
  const { rows: rowsA1 } = useMpuHistory(mpuA1, WINDOW_SINCE, 2000, true);
  const { rows: rowsA2 } = useMpuHistory(mpuA2, WINDOW_SINCE, 2000, true);

  const parseMpu = (src: unknown[]): MpuPoint[] => {
    const a = Array.isArray(src) ? src : [];
    return a.map((r) => {
      const o = r as MpuRowLike;
      return {
        ts: String(o.ts ?? o.ts_utc ?? ""),
        ax: pickG(o.ax_g, o.ax),
        ay: pickG(o.ay_g, o.ay),
        az: pickG(o.az_g, o.az),
      };
    });
  };

  // Série do atuador selecionado
  const actMpuRef = useRef<MpuPoint[]>([]);
  const [mpuChartData, setMpuChartData] = useState<MpuPoint[]>([]);
  useEffect(() => {
    const normalized = parseMpu(rowsAct as any);
    const byTs = new Map<string, MpuPoint>();
    for (const p of [...actMpuRef.current, ...normalized]) byTs.set(p.ts, p);
    const merged = Array.from(byTs.values())
      .sort((a, b) => a.ts.localeCompare(b.ts))
      .filter((p) => withinWindow(toMinuteIsoUTC(p.ts)))
      .slice(-2000);
    actMpuRef.current = merged;
    setMpuChartData(merged);
  }, [rowsAct]);

  // Séries para comparação
  const [mpuA1Data, setMpuA1Data] = useState<MpuPoint[]>([]);
  const [mpuA2Data, setMpuA2Data] = useState<MpuPoint[]>([]);
  useEffect(
    () => setMpuA1Data(parseMpu(rowsA1 as any).filter((p) => withinWindow(toMinuteIsoUTC(p.ts)))),
    [rowsA1]
  );
  useEffect(
    () => setMpuA2Data(parseMpu(rowsA2 as any).filter((p) => withinWindow(toMinuteIsoUTC(p.ts)))),
    [rowsA2]
  );

  // ===== Aggregates por minuto (API + WS) =====
  const [aggAct, setAggAct] = useState<MinuteAgg[]>([]);

  const loadAgg = useCallback(async () => {
    try {
      const actLabel = act === 1 ? "A1" : "A2";
      const data = await getMinuteAgg(actLabel as "A1" | "A2", WINDOW_SINCE).catch(
        () => [] as MinuteAgg[]
      );
      const rows = Array.isArray(data) ? data : [];
      const map = new Map<string, MinuteAgg>();
      for (const r of rows) {
        const minute = toMinuteIsoUTC(r.minute);
        if (!withinWindow(minute)) continue;
        map.set(minute, {
          minute,
          runtime_s: Number(r.runtime_s ?? 0),
          vib_avg: r.vib_avg as any,
        });
      }
      const ordered = Array.from(map.values())
        .sort((a, b) => a.minute.localeCompare(b.minute))
        .slice(-MAX_MIN);
      setAggAct(ordered);
    } catch {
      setAggAct([]);
    }
  }, [act]);

  useEffect(() => {
    loadAgg();
    const id = setInterval(loadAgg, 60_000);
    return () => clearInterval(id);
  }, [loadAgg]);

  // WS analytics-minute-agg (filtra na janela)
  useEffect(() => {
    const ws = openAnalyticsWS({
      onMessage: (m) => {
        if (m?.type !== "analytics-minute-agg") return;
        const msg = m as WSMessageAnalyticsMinuteAgg;
        const watching = act; // 1 | 2
        if (msg.actuator !== watching) return;

        const minute = toMinuteIsoUTC(msg.minute);
        if (!withinWindow(minute)) return;

        setAggAct((prev) => {
          const map = new Map(prev.map((r) => [r.minute, r]));
          map.set(minute, {
            minute,
            runtime_s: Number(msg.runtime_s ?? 0),
            vib_avg: msg.vib_avg,
          });
          const ordered = Array.from(map.values())
            .filter((r) => withinWindow(r.minute))
            .sort((a, b) => a.minute.localeCompare(b.minute))
            .slice(-MAX_MIN);
          return ordered;
        });
      },
    });
    return () => {
      try {
        ws?.close(1000, "analytics-unmount");
      } catch {}
    };
  }, [act]);

  // ===== WS /ws/grafico — média/min (mag) =====
  const [grafPoints, setGrafPoints] = useState<GrafPoint[]>([]);
  const bootMinuteRef = useRef<string | null>(null); // mantém o 1º ponto (bootstrap)

  useEffect(() => {
    const toHHMM = (iso: string): string => {
      const d = new Date(iso);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    };
    const mpuIdNum = mpuId != null ? Number(mpuId) : undefined;

    const h = openGraficoWS({
      mpuId: Number.isFinite(mpuIdNum as number) ? (mpuIdNum as number) : undefined,
      actuatorId: act,
      metric: "mag",
      onMessage: (msg: WSMessageGrafico) => {
        if (msg?.type !== "grafico") return;

        // armazena o minuto do bootstrap uma única vez
        if (msg.bootstrap && !bootMinuteRef.current) {
          bootMinuteRef.current = msg.minute;
        }

        const p: GrafPoint = {
          minute: toHHMM(msg.minute),
          minuteIso: msg.minute,
          avg: Number(msg.avg ?? 0),
          empty: Boolean(msg.empty),
          count: Number(msg.count ?? 0),
        };

        setGrafPoints((old) => {
          const map = new Map(old.map((x) => [x.minuteIso, x]));
          map.set(p.minuteIso, p);

          // garante o ponto inicial sempre presente
          if (bootMinuteRef.current && !map.has(bootMinuteRef.current)) {
            map.set(bootMinuteRef.current, {
              minute: toHHMM(bootMinuteRef.current),
              minuteIso: bootMinuteRef.current,
              avg: p.avg,
              empty: p.empty,
              count: p.count,
            });
          }

          const arr = Array.from(map.values()).sort((a, b) => a.minuteIso.localeCompare(b.minuteIso));

          if (arr.length <= 120) return arr;

          if (bootMinuteRef.current) {
            const boot = arr.find((x) => x.minuteIso === bootMinuteRef.current)!;
            const rest = arr.filter((x) => x.minuteIso !== bootMinuteRef.current);
            return [boot, ...rest.slice(-119)];
          }
          return arr.slice(-120);
        });
      },
    });

    return () => {
      try { h.close(); } catch {}
      // NÃO limpar grafPoints aqui para preservar o histórico ao trocar de gráfico
    };
  }, [mpuId, act]);

  // ===== Fallback vibração cliente =====
  const vibClientFallback = useMemo(() => {
    if (!mpuChartData?.length) return [];
    return avgVibrationByMinute(mpuChartData);
  }, [mpuChartData]);

  // ===== Dados finais Vibração/Runtime =====
  const vibRtPoints = useMemo(() => {
    // 1) Preferir WS /ws/grafico (avg por minuto)
    const wsGraf = (grafPoints ?? [])
      .map((g) => ({
        minute: toMinuteIsoUTC(g.minuteIso),
        runtime: 0,
        vib: Number(g.avg ?? 0),
        _empty: g.empty,
      }))
      .filter((p) => withinWindow(p.minute));

    if (wsGraf.length) return wsGraf;

    // 2) Depois, usar API/WS analytics-minute-agg
    const apiPoints = (aggAct ?? [])
      .filter((r) => typeof r.runtime_s === "number" && r.vib_avg != null)
      .map((r) => ({
        minute: r.minute,
        runtime: r.runtime_s ?? 0,
        vib: Number(r.vib_avg ?? 0),
      }));
    if (apiPoints.length) return apiPoints;

    // 3) Fallback cliente
    return vibClientFallback.map((r) => ({ minute: r.minute, runtime: 0, vib: r.vib }));
  }, [grafPoints, aggAct, vibClientFallback]);

  const vibRtUnit: Unit = useMemo(() => {
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

  // ===== Comparativo A1×A2 =====
  const comparePerMinute = useMemo(() => {
    const a1 = avgVibrationByMinute(mpuA1Data);
    const a2 = avgVibrationByMinute(mpuA2Data);
    if (!a1.length && !a2.length) return [];
    const mapA1 = new Map(a1.map((r) => [r.minute, r.vib]));
    const mapA2 = new Map(a2.map((r) => [r.minute, r.vib]));

    const allKeys = [...new Set<string>>([...mapA1.keys(), ...mapA2.keys()])]
      .filter(withinWindow)
      .sort();

    return allKeys.map((minute) => ({
      minute,
      vibA1: mapA1.get(minute) ?? null,
      vibA2: mapA2.get(minute) ?? null,
    }));
  }, [mpuA1Data, mpuA2Data]);

  const cmpUnit: Unit = useMemo(() => {
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
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Análise de Desempenho
          </CardTitle>

          {/* Toggle Atuador 1/2 — forçado com data-[active=true] para evitar conflitos de CSS */}
          <div className="inline-flex rounded-2xl bg-black/30 p-1 border border-white/10">
            <button
              data-active={act === 1}
              className="px-4 py-1.5 text-sm rounded-lg transition-colors
                         bg-transparent text-white/80 hover:text-white
                         data-[active=true]:bg-cyan-600 data-[active=true]:text-white"
              aria-pressed={act === 1}
              onClick={() => setSelectedId(1)}
            >
              Atuador 1
            </button>
            <button
              data-active={act === 2}
              className="px-4 py-1.5 text-sm rounded-lg transition-colors
                         bg-transparent text-white/80 hover:text-white
                         data-[active=true]:bg-cyan-600 data-[active=true]:text-white"
              aria-pressed={act === 2}
              onClick={() => setSelectedId(2)}
            >
              Atuador 2
            </button>
          </div>
        </CardHeader>

        <CardContent className="overflow-hidden">
          <Tabs defaultValue="vibracao" className="w-full">
            <TabsList className="flex justify-center gap-2 rounded-md p-1 bg-muted/20 w-full">
              <TabsTrigger value="vibracao" className="min-w-[8rem] rounded-md px-3 py-2 whitespace-nowrap">
                Vibração
              </TabsTrigger>
            </TabsList>

            <TabsContent value="vibracao" className="pt-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm">Gráfico:</span>
                <select
                  className="border rounded-md px-2 py-1 bg-background"
                  value={optVib}
                  onChange={(e) => setOptVib(e.target.value as typeof optVib)}
                >
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
                            formatter={(val: any, name: any): [string, string] => {
                              const n = Number(val);
                              if (name === "vib_disp")
                                return [
                                  Number.isFinite(n) ? n.toFixed(3) : "—",
                                  `Vibração (${unitSuffix(vibRtUnit)})`,
                                ];
                              return [String(val), String(name)];
                            }}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="vib_disp"
                            name={`Vibração A${act}`}
                            stroke={act === 1 ? C.A1 : C.A2}
                            dot
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
                      <LineChart data={compareDisplay}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="minute" tickFormatter={(tick: unknown) => fmtHHMM(tick)} />
                        <YAxis
                          domain={[0, "auto"]}
                          label={{
                            value: `Vibração (média/min) [${unitSuffix(cmpUnit)}]`,
                            angle: -90,
                            position: "insideLeft",
                          }}
                        />
                        <Tooltip
                          content={<ChartTooltipContent />}
                          labelFormatter={(val: unknown) => fmtHHMM(val)}
                          formatter={(val: any, name: any): [string, string] => {
                            if (val == null) return ["—", String(name)];
                            const n = Number(val);
                            return [
                              Number.isFinite(n) ? n.toFixed(3) : "—",
                              `${String(name)} (${unitSuffix(cmpUnit)})`,
                            ];
                          }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="vibA1_disp"
                          name="Vib A1 (média/min)"
                          stroke={C.A1}
                          dot={false}
                          strokeWidth={2}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="vibA2_disp"
                          name="Vib A2 (média/min)"
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
                  Atualiza por push a cada minuto (WS /ws/analytics e /ws/grafico) · Fallback poll 60s · Janela -10m · Atuador A{act}
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
