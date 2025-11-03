// src/components/dashboard/ProductionStats.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getOPCHistory } from "@/lib/api";
import { useOpcStream } from "@/hooks/useOpcStream";

/** ============================ */
const WINDOWS = {
  week: "-168h",
  cpm: "-60m",
  cycles: "-30m",
  occ: "-60m",
} as const;

const USE_REJECTS_FROM_BACKEND = false;

const STREAM_NAME = {
  S2: (id: number) => `Avancado_${id}S2`,
  S1: (id: number) => `Recuado_${id}S1`,
};

const COLORS = {
  indigo: "#4f46e5",
  sky: "#0ea5e9",
  emerald: "#10b981",
  blue: "#2563eb",
  green: "#16a34a",
  amber: "#f59e0b",
  orange: "#ea580c",
  red: "#ef4444",
};

type DayStat = { name: string; production: number; rejects: number };
type CpmPoint = { t: string; cpm: number }; // t = "HH:MM"
type CyclePoint = { idx: number; seconds: number };
type PieItem = { name: string; value: number };

/* ---------- helpers ---------- */
function toNumValue(rec: any): number {
  if (rec?.value !== undefined) return Number(rec.value);
  if (rec?.value_bool !== undefined) return rec.value_bool ? 1 : 0;
  if (rec?.value_num !== undefined) return Number(rec.value_num);
  return 0;
}
function toMs(rec: any): number {
  const s = rec?.ts_utc ?? rec?.ts;
  const t = typeof s === "string" ? Date.parse(s) : Number(s);
  return Number.isFinite(t) ? t : Date.now();
}
const toMinuteKey = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

export default function ProductionStats() {
  const [actuatorId, setActuatorId] = useState<number>(1);

  const [week, setWeek] = useState<DayStat[]>([]);
  const [cpmSeries, setCpmSeries] = useState<CpmPoint[]>([]);
  const [cycleSeries, setCycleSeries] = useState<CyclePoint[]>([]);
  const [occupancy, setOccupancy] = useState<PieItem[]>([]);

  const { last } = useOpcStream({ name: STREAM_NAME.S2(actuatorId) });

  const lastRiseTsRef = useRef<number | null>(null);

  /* ---------- Semana (produção por dia via subidas S2) ---------- */
  async function loadWeek(id: number) {
    const histRaw = await getOPCHistory({ actuatorId: id, facet: "S2", since: WINDOWS.week, asc: true });
    const hist = Array.isArray(histRaw) ? histRaw : [];
    const byDay: Record<string, number> = {};

    for (let i = 1; i < hist.length; i++) {
      const prev = toNumValue(hist[i - 1]);
      const curr = toNumValue(hist[i]);
      if (prev === 0 && curr === 1) {
        const d = new Date(toMs(hist[i]));
        const key = d.toISOString().slice(0, 10);
        byDay[key] = (byDay[key] || 0) + 1;
      }
    }

    const days: DayStat[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const name = d.toLocaleDateString(undefined, { weekday: "short" });
      days.push({
        name,
        production: Number(byDay[key] ?? 0),
        rejects: USE_REJECTS_FROM_BACKEND ? Number(byDay[key] ?? 0) : 0,
      });
    }
    setWeek(days);
  }

  /* ---------- CPM (últimos 60 min) ---------- */
  async function loadCpm(id: number) {
    const histRaw = await getOPCHistory({ actuatorId: id, facet: "S2", since: WINDOWS.cpm, asc: true });
    const hist = Array.isArray(histRaw) ? histRaw : [];

    const now = Date.now();
    const start = now - 60 * 60 * 1000;
    const buckets: Map<string, number> = new Map();

    // prepara os 60 minutos
    for (let i = 59; i >= 0; i--) {
      const t = new Date(now - i * 60000);
      buckets.set(toMinuteKey(t), 0);
    }

    for (let i = 1; i < hist.length; i++) {
      const prev = toNumValue(hist[i - 1]);
      const curr = toNumValue(hist[i]);
      if (prev === 0 && curr === 1) {
        const ts = toMs(hist[i]);
        if (ts >= start) {
          const key = toMinuteKey(new Date(ts));
          const prevVal = buckets.get(key) ?? 0;
          buckets.set(key, prevVal + 1);
        }
      }
    }

    // 🔧 força o tipo CpmPoint em cada item do array
    const arr: CpmPoint[] = Array.from(buckets.entries()).map(([t, cpm]): CpmPoint => ({
      t: String(t),
      cpm: Number.isFinite(cpm) ? Number(cpm) : 0,
    }));
    setCpmSeries(arr);
  }

  /* ---------- Tempo de ciclo (delta entre subidas de S2) ---------- */
  async function loadCycleTimes(id: number) {
    const histRaw = await getOPCHistory({ actuatorId: id, facet: "S2", since: WINDOWS.cycles, asc: true });
    const hist = Array.isArray(histRaw) ? histRaw : [];
    const rises: number[] = [];

    for (let i = 1; i < hist.length; i++) {
      const prev = toNumValue(hist[i - 1]);
      const curr = toNumValue(hist[i]);
      if (prev === 0 && curr === 1) rises.push(toMs(hist[i]));
    }

    const series: CyclePoint[] = [];
    for (let i = 1; i < rises.length; i++) {
      const dtSec = (rises[i] - rises[i - 1]) / 1000;
      series.push({ idx: i, seconds: Number.isFinite(dtSec) ? dtSec : 0 });
    }
    if (rises.length) lastRiseTsRef.current = rises[rises.length - 1];
    setCycleSeries(series.slice(-120));
  }

  /* ---------- Ocupação (última 1h) ---------- */
  async function loadOccupancy(id: number) {
    const [h1Raw, h2Raw] = await Promise.all([
      getOPCHistory({ actuatorId: id, facet: "S1", since: WINDOWS.occ, asc: true }),
      getOPCHistory({ actuatorId: id, facet: "S2", since: WINDOWS.occ, asc: true }),
    ]);
    const h1 = Array.isArray(h1Raw) ? h1Raw : [];
    const h2 = Array.isArray(h2Raw) ? h2Raw : [];

    const now = Date.now();
    const start = now - 60 * 60 * 1000;

    type Ev = { ts: number; s1?: number; s2?: number };
    const evs: Ev[] = [];
    for (const r of h1) evs.push({ ts: toMs(r), s1: toNumValue(r) });
    for (const r of h2) evs.push({ ts: toMs(r), s2: toNumValue(r) });
    evs.sort((a, b) => a.ts - b.ts);

    let curS1 = 0, curS2 = 0;
    let lastTs = start;
    let accS1 = 0, accS2 = 0, accTran = 0;

    for (const e of evs) {
      const ts = Math.max(start, Math.min(e.ts, now));
      if (ts > lastTs) {
        const dur = ts - lastTs;
        if (curS1 === 1 && curS2 === 0) accS1 += dur;
        else if (curS1 === 0 && curS2 === 1) accS2 += dur;
        else accTran += dur;
        lastTs = ts;
      }
      if (e.s1 !== undefined) curS1 = e.s1;
      if (e.s2 !== undefined) curS2 = e.s2;
    }
    if (now > lastTs) {
      const dur = now - lastTs;
      if (curS1 === 1 && curS2 === 0) accS1 += dur;
      else if (curS1 === 0 && curS2 === 1) accS2 += dur;
      else accTran += dur;
    }

    const total = accS1 + accS2 + accTran || 1;
    setOccupancy([
      { name: "RECUADO (S1)", value: Math.round((accS1 / total) * 100) },
      { name: "AVANÇADO (S2)", value: Math.round((accS2 / total) * 100) },
      { name: "TRANSIÇÃO", value: Math.round((accTran / total) * 100) },
    ]);
  }

  /* ---------- Efeitos ---------- */
  useEffect(() => {
    loadWeek(actuatorId);
    loadCpm(actuatorId);
    loadCycleTimes(actuatorId);
    loadOccupancy(actuatorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actuatorId]);

  // stream -> atualizações
  useEffect(() => {
    if (last?.value_bool === true) {
      const now = new Date();
      const minKey: string = toMinuteKey(now); // 🔧 garante string

      // 1) CPM
      setCpmSeries((old): CpmPoint[] => {
        const copy: CpmPoint[] = [...old];
        const idx = copy.findIndex((p) => p.t === minKey);
        if (idx >= 0) {
          const prev = copy[idx]; // CpmPoint garantido
          copy[idx] = { t: prev.t, cpm: prev.cpm + 1 }; // 🔧 mantém t explícito
        } else {
          const next: CpmPoint = { t: minKey, cpm: 1 }; // 🔧 tipado
          copy.push(next);
        }
        return copy.slice(-60);
      });

      // 2) Semana (dia atual)
      setWeek((old) => {
        const todayName = now.toLocaleDateString(undefined, { weekday: "short" });
        return old.map((d) =>
          d.name === todayName ? { ...d, production: d.production + 1 } : d
        );
      });

      // 3) Tempo de ciclo
      const tsNow = now.getTime();
      const lastRise = lastRiseTsRef.current;
      if (typeof lastRise === "number") {
        const dt = (tsNow - lastRise) / 1000;
        setCycleSeries((old) => {
          const lastIdx = old.length > 0 ? old[old.length - 1]!.idx : 0;
          return [...old, { idx: lastIdx + 1, seconds: Number.isFinite(dt) ? dt : 0 }].slice(-120);
        });
      }
      lastRiseTsRef.current = tsNow;

      // 4) Ocupação (recarrega rápido)
      loadOccupancy(actuatorId);
    }
  }, [last, actuatorId]);

  /* ---------- CSV ---------- */
  function downloadCsv(filename: string, rows: any[], headers?: string[]) {
    const cols = headers ?? (rows.length ? Object.keys(rows[0]) : []);
    const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => escape(r[c])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalProducts = useMemo(() => week.reduce((s, d) => s + d.production, 0), [week]);
  const totalDefects = useMemo(() => week.reduce((s, d) => s + d.rejects, 0), [week]);
  const qualityPie: PieItem[] = useMemo(
    () => [
      { name: "Good Products", value: Math.max(0, totalProducts - totalDefects) },
      { name: "Defective", value: totalDefects },
    ],
    [totalProducts, totalDefects]
  );

  const pieColors = [COLORS.emerald, COLORS.red];
  const occColors = [COLORS.blue, COLORS.green, COLORS.amber];

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Production Statistics</CardTitle>
          <CardDescription>
            Dados reais via OPC (S2/S1) + stream — selecione o atuador
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">Atuador:</label>
          <select
            className="border rounded-md px-2 py-1 bg-background"
            value={actuatorId}
            onChange={(e) => setActuatorId(Number(e.target.value))}
          >
            <option value={1}>AT1</option>
            <option value={2}>AT2</option>
          </select>
          <Button variant="outline" onClick={() => downloadCsv(`week_AT${actuatorId}.csv`, week)}>
            Export Week CSV
          </Button>
          <Button variant="outline" onClick={() => downloadCsv(`cpm_AT${actuatorId}.csv`, cpmSeries)}>
            Export CPM CSV
          </Button>
          <Button variant="outline" onClick={() => downloadCsv(`cycles_AT${actuatorId}.csv`, cycleSeries)}>
            Export Cycles CSV
          </Button>
          <Button variant="outline" onClick={() => downloadCsv(`occupancy_AT${actuatorId}.csv`, occupancy)}>
            Export Occupancy CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 1) Produção semanal */}
        <div className="min-w-0 w-full h-64 sm:h-72 md:h-80 lg:h-[28rem]">
          <h3 className="text-base font-medium mb-2">
            Weekly Production (AT{actuatorId}, S2 rises)
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={week} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" interval="preserveStartEnd" minTickGap={12} tickMargin={8} />
              <YAxis />
              <Tooltip />
              <Legend wrapperStyle={{ display: "none" }} />
              <Bar dataKey="production" name="Production" fill={COLORS.sky} />
              <Bar dataKey="rejects" name="Defects" fill={COLORS.orange} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 2) CPM (60 min) */}
        <div className="min-w-0 w-full h-64 sm:h-72 md:h-80 lg:h-[28rem]">
          <h3 className="text-base font-medium mb-2">CPM (last 60 min) — AT{actuatorId}</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cpmSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" interval="preserveStartEnd" minTickGap={16} tickMargin={8} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <div className="hidden sm:block">
                <Legend />
              </div>
              <Line type="monotone" dataKey="cpm" name="Cycles/min" stroke={COLORS.indigo} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 3) Tempo de ciclo */}
        <div className="min-w-0 w-full h-64 sm:h-72 md:h-80 lg:h-[28rem]">
          <h3 className="text-base font-medium mb-2">Cycle Time (sec) — AT{actuatorId}</h3>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cycleSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="idx" interval="preserveStartEnd" minTickGap={12} tickMargin={8} />
              <YAxis />
              <Tooltip />
              <div className="hidden sm:block">
                <Legend />
              </div>
              <Area type="monotone" dataKey="seconds" name="Cycle (s)" stroke={COLORS.emerald} fill={COLORS.emerald} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 4) Ocupação */}
        <div className="min-w-0 w-full h-64 sm:h-72 md:h-80 lg:h-[28rem]">
          <h3 className="text-base font-medium mb-2">
            State Occupancy (last 1h) — AT{actuatorId}
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={occupancy}
                cx="50%" cy="50%"
                innerRadius={60} outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => {
                  const p = Number(percent ?? 0) * 100;
                  return `${name}: ${p.toFixed(0)}%`;
                }}
              >
                {occupancy.map((_, i) => (
                  <Cell key={i} fill={occColors[i % occColors.length]} />
                ))}
              </Pie>
              <div className="hidden sm:block">
                <Legend />
              </div>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 5) Quality (placeholder) */}
        <div className="min-w-0 w-full h-64 sm:h-72 md:h-80 lg:h-[28rem] xl:col-span-2">
          <h3 className="text-base font-medium mb-2">Quality Overview</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={qualityPie}
                cx="50%" cy="50%"
                innerRadius={60} outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => {
                  const p = Number(percent ?? 0) * 100;
                  return `${name}: ${p.toFixed(0)}%`;
                }}
              >
                {qualityPie.map((_, i) => (
                  <Cell key={i} fill={pieColors[i % pieColors.length]} />
                ))}
              </Pie>
              <div className="hidden sm:block">
                <Legend />
              </div>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
