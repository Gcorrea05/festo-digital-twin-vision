import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getOPCHistory } from "@/lib/api";
import { useOpcStream } from "@/hooks/useOpcStream";
import { Button } from "@/components/ui/button";

type DayStat = { name: string; production: number; rejects: number };
type CpmPoint = { t: string; cpm: number };                 // t = HH:MM
type CyclePoint = { idx: number; seconds: number };
type PieItem = { name: string; value: number };

// ---- Utils para normalizar resposta do backend ----
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
  // ---- Atuador selecionável (AT1/AT2) ----
  const [actuatorId, setActuatorId] = useState<number>(1);

  // ---- Estados para todos os gráficos ----
  const [week, setWeek] = useState<DayStat[]>([]);
  const [cpmSeries, setCpmSeries] = useState<CpmPoint[]>([]);
  const [cycleSeries, setCycleSeries] = useState<CyclePoint[]>([]);
  const [occupancy, setOccupancy] = useState<PieItem[]>([]);

  // stream do S2 (AT{actuatorId}): Avancado_{id}S2
  const { last } = useOpcStream({ name: `Avancado_${actuatorId}S2` });

  // referência ao último "rise" de S2 para calcular tempo de ciclo
  const lastRiseTsRef = useRef<number | null>(null);

  // ---- Histórico semanal (produção = contagem de subidas de S2) ----
  async function loadWeek(id: number) {
    const hist = await getOPCHistory({ actuatorId: id, facet: "S2", since: "-168h", asc: true });
    const byDay: Record<string, number> = {};
    for (let i = 1; i < hist.length; i++) {
      const prev = toNumValue(hist[i - 1]);
      const curr = toNumValue(hist[i]);
      if (prev === 0 && curr === 1) {
        const d = new Date(toMs(hist[i]));
        const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
        byDay[key] = (byDay[key] || 0) + 1;
      }
    }
    const days: DayStat[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const name = d.toLocaleDateString(undefined, { weekday: "short" });
      days.push({ name, production: byDay[key] || 0, rejects: 0 });
    }
    setWeek(days);
  }

  // ---- CPM (últimos 60 min): agrega subidas por minuto ----
  async function loadCpm(id: number) {
    const hist = await getOPCHistory({ actuatorId: id, facet: "S2", since: "-60m", asc: true });
    const now = Date.now();
    const start = now - 60 * 60 * 1000;
    const buckets = new Map<string, number>(); // minute -> count

    // pré-cria minutos (0)
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
          buckets.set(key, (buckets.get(key) || 0) + 1);
        }
      }
    }

    setCpmSeries(Array.from(buckets.entries()).map(([t, cpm]) => ({ t, cpm })));
  }

  // ---- Tempo de ciclo: delta entre subidas consecutivas de S2 ----
  async function loadCycleTimes(id: number) {
    const hist = await getOPCHistory({ actuatorId: id, facet: "S2", since: "-30m", asc: true });
    const rises: number[] = [];
    for (let i = 1; i < hist.length; i++) {
      const prev = toNumValue(hist[i - 1]);
      const curr = toNumValue(hist[i]);
      if (prev === 0 && curr === 1) {
        rises.push(toMs(hist[i]));
      }
    }
    const series: CyclePoint[] = [];
    for (let i = 1; i < rises.length; i++) {
      const dt = (rises[i] - rises[i - 1]) / 1000;
      series.push({ idx: i, seconds: dt });
    }
    if (rises.length) lastRiseTsRef.current = rises[rises.length - 1];
    setCycleSeries(series.slice(-120)); // limita últimas 120 medidas
  }

  // ---- Ocupação (última 1h): integra tempos em S1=1, S2=1, TRANSIÇÃO ----
  async function loadOccupancy(id: number) {
    const [h1, h2] = await Promise.all([
      getOPCHistory({ actuatorId: id, facet: "S1", since: "-60m", asc: true }),
      getOPCHistory({ actuatorId: id, facet: "S2", since: "-60m", asc: true }),
    ]);

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
  // ---- Efeitos: carga inicial e quando troca atuador ----
  useEffect(() => {
    loadWeek(actuatorId);
    loadCpm(actuatorId);
    loadCycleTimes(actuatorId);
    loadOccupancy(actuatorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actuatorId]);

  // ---- Efeito: stream -> atualizações em tempo real ----
  useEffect(() => {
    if (last?.value_bool === true) {
      const now = new Date();
      const minKey = toMinuteKey(now);

      // 1) incrementa CPM no minuto atual
      setCpmSeries((old) => {
        const copy = [...old];
        const idx = copy.findIndex((p) => p.t === minKey);
        if (idx >= 0) copy[idx] = { ...copy[idx], cpm: copy[idx].cpm + 1 };
        else copy.push({ t: minKey, cpm: 1 });
        return copy.slice(-60);
      });

      // 2) incrementa produção de "hoje" (semana)
      setWeek((old) => {
        const todayName = now.toLocaleDateString(undefined, { weekday: "short" });
        return old.map((d) => d.name === todayName ? { ...d, production: d.production + 1 } : d);
      });

      // 3) tempo de ciclo
      const tsNow = now.getTime();
      if (lastRiseTsRef.current) {
        const dt = (tsNow - lastRiseTsRef.current) / 1000;
        setCycleSeries((old) => [...old, { idx: (old[old.length - 1]?.idx ?? 0) + 1, seconds: dt }].slice(-120));
      }
      lastRiseTsRef.current = tsNow;

      // 4) ocupação: recarrega rápido (sem criar endpoint novo)
      loadOccupancy(actuatorId);
    }
  }, [last, actuatorId]);

  // ---- CSV exports (sem endpoints novos) ----
  function downloadCsv(filename: string, rows: any[], headers?: string[]) {
    const cols = headers ?? (rows.length ? Object.keys(rows[0]) : []);
    const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...rows.map(r => cols.map(c => escape(r[c])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const totalProducts = useMemo(() => week.reduce((s, d) => s + d.production, 0), [week]);
  const totalDefects = useMemo(() => week.reduce((s, d) => s + d.rejects, 0), [week]);
  const qualityPie: PieItem[] = useMemo(() => ([
    { name: "Good Products", value: Math.max(0, totalProducts - totalDefects) },
    { name: "Defective", value: totalDefects },
  ]), [totalProducts, totalDefects]);

  const pieColors = ["#22c55e", "#ef4444"];
  const occColors = ["#2563eb", "#16a34a", "#f59e0b"];

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Production Statistics</CardTitle>
          <CardDescription>Dados reais via OPC (S2/S1) + stream — selecione o atuador</CardDescription>
        </div>
        <div className="flex items-center gap-2">
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

      <CardContent className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
        {/* 1) Produção semanal */}
        <div className="h-[300px]">
          <h3 className="text-base font-medium mb-2">Weekly Production (AT{actuatorId}, S2 rises)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={week} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(v, n) => [`${v} units`, n === "production" ? "Production" : "Rejects"]} />
              <Legend />
              <Bar dataKey="production" name="Production" fill="#1EAEDB" />
              <Bar dataKey="rejects" name="Defects" fill="#FF5722" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 2) CPM por minuto (últimos 60 min) */}
        <div className="h-[300px]">
          <h3 className="text-base font-medium mb-2">CPM (last 60 min) — AT{actuatorId}</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cpmSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="cpm" name="Cycles/min" stroke="#4f46e5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 3) Tempo de ciclo (últimos N ciclos) */}
        <div className="h-[300px]">
          <h3 className="text-base font-medium mb-2">Cycle Time (sec) — AT{actuatorId}</h3>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cycleSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="idx" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="seconds" name="Cycle (s)" stroke="#10b981" fill="#10b981" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 4) Ocupação de estados (última 1h) */}
        <div className="h-[300px]">
          <h3 className="text-base font-medium mb-2">State Occupancy (last 1h) — AT{actuatorId}</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={occupancy}
                cx="50%" cy="50%"
                innerRadius={60} outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {occupancy.map((_, i) => (<Cell key={i} fill={occColors[i % occColors.length]} />))}
              </Pie>
              <Legend />
              <Tooltip formatter={(v) => [`${v}%`, "Percent"]} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 5) Quality pie (placeholder até termos rejects reais) */}
        <div className="h-[300px] 2xl:col-span-2">
          <h3 className="text-base font-medium mb-2">Quality Overview</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={qualityPie}
                cx="50%" cy="50%"
                innerRadius={60} outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {qualityPie.map((_, i) => (<Cell key={i} fill={pieColors[i % pieColors.length]} />))}
              </Pie>
              <Legend />
              <Tooltip formatter={(v) => [`${v} units`, ""]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
