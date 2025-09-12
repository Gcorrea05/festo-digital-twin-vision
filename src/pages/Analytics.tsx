import React, { useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import ProductionStats from '@/components/dashboard/ProductionStats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PieChart, Pie, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { Download, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';

// ✅ IMPORTES CORRETOS DOS HOOKS DE MPU
import { useMpuIds, useMpuHistory, useMpuStream } from '@/hooks/useMpu';

// OPC
import { getOPCHistory } from '@/lib/api';
import { useOpcStream } from '@/hooks/useOpcStream';

type PieItem = { name: string; value: number; color?: string };
type CpmPoint = { t: string; cpm: number };
type OccItem = { name: string; value: number };

const colorsAct = ['#4f46e5', '#0ea5e9'];
const occColors = ['#2563eb', '#16a34a', '#f59e0b'];

function toMinuteKey(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

const Analytics = () => {
  const [date, setDate] = useState<Date | undefined>(new Date());

  // ===== Integração MPU (real) =====
  const { ids } = useMpuIds();
  const [mpuId, setMpuId] = useState<string | null>(null);
  useEffect(() => { if (!mpuId && ids.length) setMpuId(ids[0]); }, [ids, mpuId]);

  const { rows } = useMpuHistory(mpuId, "-5m", 1000, true);
  const { last } = useMpuStream({ id: mpuId || undefined });

  const mpuSeriesRef = useRef<any[]>([]);
  useEffect(() => { mpuSeriesRef.current = [...rows]; }, [rows]);
  useEffect(() => {
    if (last && mpuId && last.id === mpuId) {
      mpuSeriesRef.current.push(last);
      if (mpuSeriesRef.current.length > 1200) mpuSeriesRef.current.shift();
    }
  }, [last, mpuId]);
  const chartData = useMemo(() => [...mpuSeriesRef.current], [rows, last]);

  // ===== Production: Pie por Atuador (7 dias) + CPM 60 min (AT1+AT2) =====
  const [prodPie, setProdPie] = useState<PieItem[]>([]);
  const [cpmSeries, setCpmSeries] = useState<CpmPoint[]>([]);

  async function loadProdPie() {
    const [h1, h2] = await Promise.all([
      getOPCHistory({ actuatorId: 1, facet: "S2", since: "-168h", asc: true }),
      getOPCHistory({ actuatorId: 2, facet: "S2", since: "-168h", asc: true }).catch(() => [] as any),
    ]);
    const countRises = (hist: any[]) => {
      let c = 0;
      for (let i = 1; i < hist.length; i++) {
        if (Number(hist[i - 1].value) === 0 && Number(hist[i].value) === 1) c++;
      }
      return c;
    };
    setProdPie([
      { name: "AT1", value: countRises(h1), color: colorsAct[0] },
      { name: "AT2", value: countRises(h2), color: colorsAct[1] },
    ]);
  }

  async function loadCpm60() {
    const now = Date.now();
    const start = now - 60 * 60 * 1000;
    const buckets = new Map<string, number>();
    for (let i = 59; i >= 0; i--) buckets.set(toMinuteKey(new Date(now - i * 60000)), 0);

    const agg = async (id: number) => {
      const h = await getOPCHistory({ actuatorId: id, facet: "S2", since: "-60m", asc: true }).catch(() => [] as any);
      for (let i = 1; i < h.length; i++) {
        const prev = Number(h[i - 1].value), curr = Number(h[i].value);
        if (prev === 0 && curr === 1) {
          const ts = new Date(h[i].ts).getTime();
          if (ts >= start) {
            const key = toMinuteKey(new Date(ts));
            buckets.set(key, (buckets.get(key) || 0) + 1);
          }
        }
      }
    };
    await Promise.all([agg(1), agg(2)]);
    setCpmSeries(Array.from(buckets.entries()).map(([t, cpm]) => ({ t, cpm })));
  }
  // ===== Operational: Ocupação (última 1h) com seletor de atuador =====
  const [occAct, setOccAct] = useState<number>(1);
  const [occupancy, setOccupancy] = useState<OccItem[]>([]);

  async function loadOccupancy(id: number) {
    const [h1, h2] = await Promise.all([
      getOPCHistory({ actuatorId: id, facet: "S1", since: "-60m", asc: true }),
      getOPCHistory({ actuatorId: id, facet: "S2", since: "-60m", asc: true }),
    ]);
    const now = Date.now();
    const start = now - 60 * 60 * 1000;

    type Ev = { ts: number; s1?: number; s2?: number };
    const evs: Ev[] = [];
    for (const r of h1) evs.push({ ts: new Date(r.ts).getTime(), s1: Number(r.value) });
    for (const r of h2) evs.push({ ts: new Date(r.ts).getTime(), s2: Number(r.value) });
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

  // ----- Efeitos iniciais -----
  useEffect(() => { loadProdPie(); loadCpm60(); }, []);
  useEffect(() => { loadOccupancy(occAct); }, [occAct]);

  // ===== WS realtime: CPM (S2 A1 + S2 A2) =====
  const { last: s2a1 } = useOpcStream({ name: "Avancado_1S2" });
  const { last: s2a2 } = useOpcStream({ name: "Avancado_2S2" });

  useEffect(() => {
    const handle = (evt?: any) => {
      if (!evt || evt.value_bool !== true) return;
      const key = toMinuteKey(new Date());
      setCpmSeries((old) => {
        if (!old.length) return [{ t: key, cpm: 1 }];
        const idx = old.findIndex((p) => p.t === key);
        if (idx >= 0) {
          const copy = [...old];
          copy[idx] = { ...copy[idx], cpm: copy[idx].cpm + 1 };
          return copy;
        }
        const next = [...old, { t: key, cpm: 1 }];
        // mantém ~60 pontos (se ultrapassar, remove o primeiro)
        return next.length > 60 ? next.slice(next.length - 60) : next;
      });
    };
    handle(s2a1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s2a1]);

  useEffect(() => {
    const key = toMinuteKey(new Date());
    if (s2a2?.value_bool === true) {
      setCpmSeries((old) => {
        if (!old.length) return [{ t: key, cpm: 1 }];
        const idx = old.findIndex((p) => p.t === key);
        if (idx >= 0) {
          const copy = [...old];
          copy[idx] = { ...copy[idx], cpm: copy[idx].cpm + 1 };
          return copy;
        }
        const next = [...old, { t: key, cpm: 1 }];
        return next.length > 60 ? next.slice(next.length - 60) : next;
      });
    }
  }, [s2a2]);

  // ===== WS realtime: Ocupação (S1/S2 do atuador selecionado) com debounce =====
  const { last: s1Sel } = useOpcStream({ name: `Recuado_${occAct}S1` });
  const { last: s2Sel } = useOpcStream({ name: `Avancado_${occAct}S2` });
  const occTimer = useRef<number | null>(null);

  const scheduleOccRefresh = () => {
    if (occTimer.current) window.clearTimeout(occTimer.current);
    occTimer.current = window.setTimeout(() => loadOccupancy(occAct), 400) as unknown as number;
  };

  useEffect(() => { if (typeof s1Sel?.value_bool === 'boolean') scheduleOccRefresh(); }, [s1Sel]);
  useEffect(() => { if (typeof s2Sel?.value_bool === 'boolean') scheduleOccRefresh(); }, [s2Sel]);
  useEffect(() => () => { 
    if (occTimer.current) window.clearTimeout(occTimer.current); 
  }, []);

  return (
    <Layout title="Analytics" description="Performance metrics and statistical analysis">
      <div className="grid grid-cols-12 gap-6">
        {/* KPI compactos reais */}
        <div className="col-span-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: "Weekly Total (AT1+AT2)", value: prodPie.reduce((s, p) => s + p.value, 0) + " cycles" },
              { title: "Peak CPM (60m)", value: (cpmSeries.reduce((m, p) => Math.max(m, p.cpm), 0) || 0) + " cpm" },
              { title: "Selected MPU", value: mpuId ?? "—" },
            ].map((kpi, idx) => (
              <Card key={idx}>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">{kpi.title}</p>
                      <p className="text-2xl font-bold mt-1">{kpi.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        {/* Date picker + export CPM */}
        <div className="col-span-12 flex flex-col sm:flex-row justify-between items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[240px] justify-start">
                <Calendar className="mr-2 h-4 w-4" />
                {date ? format(date, 'PPP') : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent mode="single" selected={date} onSelect={setDate} initialFocus />
            </PopoverContent>
          </Popover>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
              const cols = ["t","cpm"];
              const csv = [cols.join(","), ...cpmSeries.map(r => `${r.t},${r.cpm}`)].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "cpm_60min.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}>
              <Download className="mr-2 h-4 w-4" />
              Export CPM CSV
            </Button>
          </div>
        </div>

        {/* Production Analytics (component detalhado) */}
        <div className="col-span-12">
          <ProductionStats />
        </div>

        {/* Tabs com dados reais */}
        <div className="col-span-12">
          <Card>
            <CardHeader>
              <CardTitle>Performance Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="production">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="production">Production</TabsTrigger>
                  <TabsTrigger value="operational">Operational Time</TabsTrigger>
                  <TabsTrigger value="mpu">MPU</TabsTrigger>
                </TabsList>

                {/* Production Tab */}
                <TabsContent value="production" className="pt-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Pie: Production by Actuator (7d) */}
                    <div className="h-80">
                      <h3 className="text-lg font-medium mb-4">Production by Actuator (last 7 days)</h3>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={prodPie}
                            cx="50%" cy="50%"
                            labelLine={false}
                            outerRadius={100}
                            dataKey="value"
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          >
                            {prodPie.map((entry, i) => (
                              <Cell key={entry.name} fill={entry.color || colorsAct[i % colorsAct.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => [`${v} cycles`, 'Total']} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Line: CPM (60m, AT1+AT2) */}
                    <div className="h-80">
                      <h3 className="text-lg font-medium mb-4">Cycles per Minute — last 60 min</h3>
                      <ChartContainer className="h-full" config={{}}>
                        <LineChart data={cpmSeries}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="t" />
                          <YAxis allowDecimals={false} />
                          <Tooltip content={<ChartTooltipContent />} />
                          <Legend />
                          <Line type="monotone" dataKey="cpm" name="Cycles/min" stroke="#4f46e5" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ChartContainer>
                    </div>
                  </div>
                </TabsContent>

                {/* Operational Time Tab */}
                <TabsContent value="operational" className="pt-4">
                  <div className="flex items-center gap-3 mb-4">
                    <label className="text-sm">Actuator:</label>
                    <select
                      className="border rounded-md px-2 py-1 bg-background"
                      value={occAct}
                      onChange={(e) => setOccAct(Number(e.target.value))}
                    >
                      <option value={1}>AT1</option>
                      <option value={2}>AT2</option>
                    </select>
                    <Button variant="outline" onClick={() => loadOccupancy(occAct)}>Refresh</Button>
                  </div>

                  <div className="h-80">
                    <h3 className="text-lg font-medium mb-4">State Occupancy (last 1h)</h3>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={occupancy}
                          cx="50%" cy="50%"
                          innerRadius={60} outerRadius={85}
                          dataKey="value"
                          paddingAngle={2}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        >
                          {occupancy.map((_, i) => (<Cell key={i} fill={occColors[i % occColors.length]} />))}
                        </Pie>
                        <Legend />
                        <Tooltip formatter={(v) => [`${v}%`, 'Percent']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>

                {/* MPU Tab */}
                <TabsContent value="mpu" className="pt-4">
                  <div className="flex items-center gap-3 mb-4">
                    <label className="text-sm">MPU:</label>
                    <select
                      className="border rounded-md px-2 py-1 bg-background"
                      value={mpuId ?? ""}
                      onChange={(e) => setMpuId(e.target.value || null)}
                    >
                      {ids.map((id) => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </select>
                    <span className="text-xs text-muted-foreground">
                      Histórico 5 min + stream ao vivo
                    </span>
                  </div>

                  <div className="h-80">
                    <h3 className="text-lg font-medium mb-4">MPU Acceleration (g)</h3>
                    <ChartContainer className="h-full" config={{}}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="ts" tickFormatter={(v) => new Date(v).toLocaleTimeString(undefined, { minute: '2-digit', second: '2-digit' })} />
                        <YAxis />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend />
                        <Line type="monotone" dataKey="ax" stroke="#4f46e5" strokeWidth={2} name="ax (g)" dot={false} />
                        <Line type="monotone" dataKey="ay" stroke="#0ea5e9" strokeWidth={2} name="ay (g)" dot={false} />
                        <Line type="monotone" dataKey="az" stroke="#22d3ee" strokeWidth={2} name="az (g)" dot={false} />
                      </LineChart>
                    </ChartContainer>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Analytics;
