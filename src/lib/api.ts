// src/lib/api.ts  (1/4)

// ======================
// Base e utilitário HTTP
// ======================
export const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (import.meta as any)?.env?.VITE_API_URL ||
  "http://localhost:8000";

export function getApiBase() {
  return API_BASE;
}

export async function fetchJson<T = any>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText} on ${url}`);
  return (await res.json()) as T;
}

export async function postJson<T = any>(path: string, body: any, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
    body: JSON.stringify(body ?? {}),
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText} on ${url}`);
  return (await res.json()) as T;
}

// ======================
// Tipos
// ======================
export type StableState = "RECUADO" | "AVANÇADO" | "DESCONHECIDO";
export type PendingTarget = "AV" | "REC" | null;
export type Fault = "NONE" | "FAULT_TIMEOUT" | "FAULT_SENSORS_CONFLICT";

export type LatchedActuator = {
  actuator_id: 1 | 2;
  state: StableState;
  pending: PendingTarget;
  fault: Fault;
  elapsed_ms: number;
  started_at: string | null; // ISO
};

export type LatchedResp = {
  ts: string; // ISO
  actuators: LatchedActuator[];
};

export type CyclesTotalResp = {
  total: number;
  actuators: {
    actuator_id: number;
    cycles: number;
    last_state?: string | null;
    since: string; // ISO
    baseline?: string | null;
    seen_other?: boolean;
  }[];
  ts: string; // ISO
};

// === Novo: shape nativo do /api/live/actuators/cpm ===
export type ActuatorsCpmResp = {
  ts: string;
  actuators: { id: number; window_s: number; cycles: number; cpm: number }[];
};

// === Compat antigo (Monitoring) ===
export type CyclesRateResp = {
  window_seconds: number;
  pairs_count: number;       // compat: usamos "cycles"
  cycles: number;            // soma dos dois atuadores
  cycles_per_second: number; // CPM = *60
};

export type VibrationLiveItem = {
  mpu_id: number;
  ts_start: string; // ISO
  ts_end: string;   // ISO
  rms_ax: number;
  rms_ay: number;
  rms_az: number;
  overall: number;
};
export type VibrationLiveResp = { items: VibrationLiveItem[] };

export type ActuatorTimingsResp = {
  actuators: {
    actuator_id: number;
    last: {
      ts_utc: string | null;
      dt_abre_s: number | null;
      dt_fecha_s: number | null;
      dt_ciclo_s: number | null;
    };
  }[];
};

export type SystemStatusResp = {
  components?: {
    actuators?: string;
    sensors?: string;
    transmission?: string;
    control?: string;
  };
};

export type HealthResp = {
  status: "ok" | "degraded" | "offline";
  started_at?: string;
};

// ======================
// Dashboard (Live / etc.)
// ======================
export async function getActuatorsState(): Promise<LatchedResp> {
  const bust = Date.now();
  return fetchJson<LatchedResp>(`/api/live/actuators/state-mon?_=${bust}`);
}
export const getLatchedActuators = getActuatorsState;

export async function getCyclesTotal(): Promise<CyclesTotalResp> {
  return fetchJson<CyclesTotalResp>(`/api/live/cycles/total`);
}

// ======================
// Monitoring
// ======================
export async function getCyclesRate60s(windowS: number = 60): Promise<CyclesRateResp> {
  const r = await fetchJson<ActuatorsCpmResp>(`/api/live/actuators/cpm?window_s=${windowS}`);
  const sumCycles = (r?.actuators ?? []).reduce((acc, a) => acc + (a.cycles || 0), 0);
  const sumCpm = (r?.actuators ?? []).reduce((acc, a) => acc + (a.cpm || 0), 0);
  return {
    window_seconds: windowS,
    pairs_count: sumCycles,
    cycles: sumCycles,
    cycles_per_second: sumCpm / 60.0,
  };
}

export async function getVibrationLive(windowS: number = 2): Promise<VibrationLiveResp> {
  return fetchJson<VibrationLiveResp>(`/api/live/vibration?window_s=${windowS}`);
}

export async function getActuatorTimings(): Promise<ActuatorTimingsResp> {
  return fetchJson<ActuatorTimingsResp>(`/api/live/actuators/timings`);
}

// ======================
// System status / Health
// ======================
export async function getSystemStatus(): Promise<SystemStatusResp> {
  return {};
}

export async function getHealth(): Promise<HealthResp> {
  try {
    return await fetchJson<HealthResp>(`/api/health`);
  } catch {
    try {
      return await fetchJson<HealthResp>(`/health`);
    } catch {
      return { status: "offline" };
    }
  }
}
// src/lib/api.ts  (2/4)

// ======================
// Analytics (compat OPC)
// ======================
export type OPCHistoryRow = { ts: string; value: number | boolean | string | null | undefined };

// Coerção robusta de boolean vindo do OPC
function toBool01(v: any): 0 | 1 {
  if (v === true || v === "true" || v === "True" || v === "TRUE") return 1;
  if (v === false || v === "false" || v === "False" || v === "FALSE") return 0;
  if (v === 1 || v === "1") return 1;
  if (v === 0 || v === "0") return 0;
  const n = Number(v);
  if (Number.isFinite(n)) return n > 0 ? 1 : 0;
  return 0;
}

// Tenta várias sintaxes de "since" até achar dados
async function opcSinceVariants(actuatorId: number, facet: "S1" | "S2", since: string, asc = true) {
  const variants = since.startsWith("-")
    ? [since, "-120m", "-2h", "-7200s"] // tenta várias
    : [since];

  for (const s of variants) {
    const qs = new URLSearchParams({
      act: String(actuatorId),
      facet,
      since: s,
      ...(asc ? { asc: "1" } : {}),
    });
    try {
      const raw = await fetchJson<any>(`/opc/history?${qs.toString()}`);
      const arr = (Array.isArray(raw) ? raw : raw?.items) ?? [];
      if (arr.length) {
        if (typeof window !== "undefined")
          console.info(`[opcSinceVariants] facet=${facet} since=${s} -> ${arr.length} rows`);
        return arr as any[];
      }
    } catch {
      // tenta o próximo formato
    }
  }
  if (typeof window !== "undefined")
    console.warn(`[opcSinceVariants] facet=${facet} sem dados nas variantes: ${variants.join(", ")}`);
  return [] as any[];
}

export async function getOPCHistory(params: {
  actuatorId: number;        // 1|2
  facet: "S1" | "S2";
  since: string;
  asc?: boolean;
}): Promise<OPCHistoryRow[]> {
  try {
    const arr = await opcSinceVariants(params.actuatorId, params.facet, params.since, !!params.asc);
    if (arr.length) {
      return (arr as any[]).map((r) => ({
        ts: String(r.ts_utc ?? r.ts ?? r.timestamp ?? new Date().toISOString()),
        value: r.value_bool ?? r.value ?? r.v ?? 0,
      }));
    }
  } catch {
    // cai no byName
  }
  const name = params.facet === "S1" ? `Recuado_${params.actuatorId}S1` : `Avancado_${params.actuatorId}S2`;
  return getOPCHistoryByName(name, params.since, !!params.asc, 20000);
}

export async function getOPCHistoryByName(
  name: string,
  since: string = "-10m",
  asc: boolean = true,
  limit: number = 20000
): Promise<OPCHistoryRow[]> {
  const variants = since.startsWith("-") ? [since, "-120m", "-2h", "-7200s"] : [since];
  for (const s of variants) {
    const qs = new URLSearchParams({ name, since: s, limit: String(limit), ...(asc ? { asc: "1" } : {}) });
    try {
      const raw = await fetchJson<any>(`/opc/history?${qs.toString()}`);
      const arr = (Array.isArray(raw) ? raw : raw?.items) ?? [];
      if (arr.length) {
        if (typeof window !== "undefined")
          console.info(`[getOPCHistoryByName] name=${name} since=${s} -> ${arr.length} rows`);
        return (arr as any[]).map((r) => ({
          ts: String(r.ts_utc ?? r.ts ?? r.time ?? new Date().toISOString()),
          value: r.value_bool ?? r.value ?? r.v ?? 0,
        }));
      }
    } catch {
      // tenta próxima
    }
  }
  return [];
}
export const getOpcHistoryByName = getOPCHistoryByName;

// ======================
// Analytics – minute-agg (normalizador)
// ======================
export type MinuteAgg = {
  minute: string;
  t_open_ms_avg: number | null;
  t_close_ms_avg: number | null;
  t_cycle_ms_avg: number | null;
  runtime_s: number;
  cpm: number;
  vib_avg?: number | null;
};

// normaliza uma linha com possíveis aliases vindos do backend
function normalizeMinuteAggRow(r: any): MinuteAgg | null {
  if (!r) return null;
  const minute =
    r.minute ?? r.ts ?? r.bucket_start ?? r.bucket ?? r.time ?? r.t ?? new Date().toISOString();

  // tempos médios
  const t_open_ms_avg  = r.t_open_ms_avg  ?? r.to_ms_avg ?? r.open_ms_avg  ?? null;
  const t_close_ms_avg = r.t_close_ms_avg ?? r.tf_ms_avg ?? r.close_ms_avg ?? null;
  const t_cycle_ms_avg = r.t_cycle_ms_avg ?? r.tc_ms_avg ?? r.cycle_ms_avg ?? null;

  // runtime em segundos (clamp 0..60)
  let runtime_s =
    r.runtime_s ?? r.runtime ?? (typeof r.runtime_ms === "number" ? r.runtime_ms / 1000 : undefined) ?? 0;
  runtime_s = Number(runtime_s);
  if (!Number.isFinite(runtime_s)) runtime_s = 0;
  runtime_s = Math.max(0, Math.min(60, runtime_s));

  // cpm (ou equivalente)
  let cpm =
    r.cpm ?? r.cpm_avg ?? r.cpm_sum ?? r.cycles ??
    (typeof r.cps === "number" ? r.cps * 60 : undefined) ??
    r.value ?? 0;
  cpm = Number(cpm);
  if (!Number.isFinite(cpm) || cpm < 0) cpm = 0;

  const vib_avg = r.vib_avg ?? r.vibration_avg ?? r.vib ?? null;

  return {
    minute: String(minute),
    t_open_ms_avg: t_open_ms_avg != null ? Number(t_open_ms_avg) : null,
    t_close_ms_avg: t_close_ms_avg != null ? Number(t_close_ms_avg) : null,
    t_cycle_ms_avg: t_cycle_ms_avg != null ? Number(t_cycle_ms_avg) : null,
    runtime_s,
    cpm,
    vib_avg: vib_avg != null ? Number(vib_avg) : null,
  };
}

const takeArray = (payload: any) =>
  (Array.isArray(payload) && payload) ||
  payload?.data || payload?.items || payload?.rows || payload?.results || payload?.records || [];

/** tenta algumas formas razoáveis de query aceitas por backends diferentes */
async function tryMinuteAggMany(act: "A1" | "A2", since: string): Promise<MinuteAgg[]> {
  const id = act === "A1" ? "1" : "2";
  const combos: Array<Record<string, string>> = [
    { act }, { act: id }, { id }, { actuator: id }, {},
  ];
  for (const a of combos) {
    const qs = new URLSearchParams({ ...a, since }).toString();
    const url = `/metrics/minute-agg?${qs}`;
    try {
      const raw = await fetchJson<any>(url);
      const arr = takeArray(raw);
      if (Array.isArray(arr) && arr.length) {
        const out = arr.map(normalizeMinuteAggRow).filter(Boolean) as MinuteAgg[];
        if (out.length) return out.sort((x, y) => x.minute.localeCompare(y.minute));
      }
    } catch {
      // tenta próxima combinação
    }
  }
  return [];
}

export async function getMinuteAgg(act: "A1" | "A2", since: string): Promise<MinuteAgg[]> {
  return tryMinuteAggMany(act, since);
}
// src/lib/api.ts  (3/4)

// ======================
// CPM × Runtime (via OPC — garante dados)
// ======================
export type CpmRuntimeMinuteRow = {
  minute: string;           // ISO do minuto
  cpm: number | null;       // ciclos no minuto
  runtime_s: number | null; // segundos ativos (0..60)
};

// Helpers de tempo/minuto
type MinuteMapNum = Map<string, number>;

const toMinuteIsoUTC = (d: Date) =>
  new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), 0, 0
  )).toISOString();

const actLabelToId = (act: "A1" | "A2"): 1 | 2 => (act === "A1" ? 1 : 2);

/** CPM por minuto via OPC (conta bordas 0->1 em S2) */
async function cpmFromOpcByMinute(act: "A1" | "A2", since: string): Promise<MinuteMapNum> {
  const id = actLabelToId(act);
  const rows = await getOPCHistory({ actuatorId: id, facet: "S2", since, asc: true })
    .catch(() => [] as OPCHistoryRow[]);
  const map: MinuteMapNum = new Map();
  for (let i = 1; i < rows.length; i++) {
    const prev = toBool01((rows[i - 1] as any).value);
    const curr = toBool01((rows[i] as any).value);
    if (prev === 0 && curr === 1) {
      const key = toMinuteIsoUTC(new Date(rows[i].ts));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return map;
}

/** Runtime em segundos por minuto via OPC (tempo com S2==1) */
async function runtimeFromOpcByMinute(act: "A1" | "A2", since: string): Promise<MinuteMapNum> {
  const id = actLabelToId(act);
  const rows = await getOPCHistory({ actuatorId: id, facet: "S2", since, asc: true })
    .catch(() => [] as OPCHistoryRow[]);
  const out: MinuteMapNum = new Map();
  if (!rows.length) return out;

  // percorre segmentos em que o estado permanece constante
  for (let i = 0; i < rows.length; i++) {
    const v = toBool01((rows[i] as any).value);
    if (!v) continue; // só contamos quando está "1"
    const t0 = new Date(rows[i].ts).getTime();
    const t1 = i + 1 < rows.length ? new Date(rows[i + 1].ts).getTime() : Date.now();

    // fatiar por minuto para agregar corretamente
    let t = t0;
    while (t < t1) {
      const d = new Date(t);
      const key = toMinuteIsoUTC(d);
      const endOfMinute = new Date(Date.UTC(
        d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
        d.getUTCHours(), d.getUTCMinutes(), 59, 999
      )).getTime();
      const chunkEnd = Math.min(endOfMinute + 1, t1);
      const sec = Math.max(0, Math.min(60, (chunkEnd - t) / 1000));
      out.set(key, Math.min(60, (out.get(key) ?? 0) + sec));
      t = chunkEnd;
    }
  }
  return out;
}

/** NOVA implementação robusta: usa minute-agg se houver; senão calcula pelo OPC. */
export async function getCpmRuntimeMinute(
  act: "A1" | "A2",
  since: string = "-120m" // usa um formato que sabemos que o backend aceita
): Promise<CpmRuntimeMinuteRow[]> {
  // 1) tenta minute-agg (se o backend fornecer)
  const minuteAgg = await tryMinuteAggMany(act, since).catch(() => [] as MinuteAgg[]);
  if (minuteAgg.length) {
    const rows = minuteAgg.map(r => ({
      minute: r.minute,
      cpm: r.cpm ?? 0,
      runtime_s: r.runtime_s ?? 0,
    })).sort((a,b) => a.minute.localeCompare(b.minute));
    if (typeof window !== "undefined")
      console.info(`[getCpmRuntimeMinute][${act}] via minute-agg -> ${rows.length} pontos`);
    return rows;
  }

  // 2) fallback 100% via OPC (com since variants já dentro do getOPCHistory)
  const [cpmMap, rtMap] = await Promise.all([
    cpmFromOpcByMinute(act, since),
    runtimeFromOpcByMinute(act, since),
  ]);

  const keys = new Set<string>([...cpmMap.keys(), ...rtMap.keys()]);
  const rows: CpmRuntimeMinuteRow[] = [];
  for (const k of keys) {
    rows.push({ minute: k, cpm: cpmMap.get(k) ?? 0, runtime_s: rtMap.get(k) ?? 0 });
  }
  rows.sort((a, b) => a.minute.localeCompare(b.minute));

  if (typeof window !== "undefined") {
    console.info(`[getCpmRuntimeMinute][${act}] via OPC -> ${rows.length} pontos`);
    if (!rows.length) console.warn("[getCpmRuntimeMinute] Nenhum ponto: verifique se há transições S2 0→1 no período.");
  }
  return rows;
}

// ======================
// LiveContext helpers (system + actuators + mpu)
// ======================
export async function getLiveActuatorsState(): Promise<{
  ts: string;
  system: { status: string };
  actuators: any[];
}> {
  const normAct = (raw: any) => {
    if (!raw) return null;
    const id = Number(raw.id ?? raw.actuator_id);
    if (!Number.isFinite(id)) return null;
    return {
      id,
      state: raw.state ?? null,
      pending: raw.pending ?? null,
      fault: raw.fault ?? null,
      facets: raw.facets ?? undefined,
      cycles: raw.cycles ?? raw.count ?? raw.total ?? undefined,
      totalCycles: raw.totalCycles ?? raw.total ?? raw.cycles ?? undefined,
      ts: raw.ts ?? raw.ts_utc ?? undefined,
      started_at: raw.started_at ?? undefined,
      elapsed_ms: raw.elapsed_ms ?? undefined,
      ...raw,
      actuator_id: undefined,
    };
  };

  try {
    const data = await fetchJson<any>("/api/live/actuators/state-mon");

    let status = String(data?.system?.status ?? "").toLowerCase();
    if (!status) {
      try {
        const h = await getHealth();
        status = String(h?.status ?? "unknown").toLowerCase();
      } catch {
        status = "unknown";
      }
    }

    const arr = Array.isArray(data?.actuators) ? data.actuators : [];
    const actuators = arr.map(normAct).filter(Boolean);

    return {
      ts: String(data?.ts ?? new Date().toISOString()),
      system: { status },
      actuators,
    };
  } catch {
    try {
      const raw = await fetchJson<any>("/api/live/actuators/state");
      const arr = Array.isArray(raw?.actuators) ? raw.actuators : [];
      const actuators = arr.map(normAct).filter(Boolean);
      const h = await getHealth().catch(() => ({ status: "offline" } as any));
      return {
        ts: String(raw?.ts ?? new Date().toISOString()),
        system: { status: String((h as any)?.status ?? "unknown") },
        actuators,
      };
    } catch {
      const h = await getHealth().catch(() => ({ status: "offline" } as any));
      return { ts: new Date().toISOString(), system: { status: String((h as any).status) }, actuators: [] };
    }
  }
}
// src/lib/api.ts  (4/4)

// ---- MPU: ids disponíveis ----
export async function getMpuIds(): Promise<Array<string | number>> {
  try {
    const r = await fetchJson<any>("/mpu/ids");
    return Array.isArray(r?.ids) ? r.ids : Array.isArray(r) ? r : [];
  } catch {
    try {
      const r = await fetchJson<any>("/api/mpu/ids");
      return Array.isArray(r?.ids) ? r.ids : Array.isArray(r) ? r : [];
    } catch {
      return [];
    }
  }
}

// ---- MPU: último valor ----
export type MpuLatestCompat = {
  ts_utc: string;
  id: string | number;
  ax: number; ay: number; az: number;
  gx?: number; gy?: number; gz?: number;
  ax_g?: number | null; ay_g?: number | null; az_g?: number | null;
  gx_dps?: number | null; gy_dps?: number | null; gz_dps?: number | null;
  temp_c?: number | null;
};

export async function getLatestMPU(id: number | "MPUA1" | "MPUA2" | string): Promise<MpuLatestCompat | null> {
  const asStr = String(id);
  const qs = new URLSearchParams({ id: asStr, since: "-30m", limit: "1" });
  let raw: any;
  try {
    raw = await fetchJson<any>(`/mpu/history?${qs.toString()}`);
  } catch {
    try {
      raw = await fetchJson<any>(`/api/mpu/history?${qs.toString()}`);
    } catch {
      return null;
    }
  }

  const items: any[] = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  if (!items.length) return null;
  const r = items[0];

  const ts = String(r.ts_utc ?? r.ts ?? new Date().toISOString());
  const ax = Number(r.ax ?? r.ax_g ?? r.x ?? 0);
  const ay = Number(r.ay ?? r.ay_g ?? r.y ?? 0);
  const az = Number(r.az ?? r.az_g ?? r.z ?? 0);
  const gx = Number(r.gx ?? r.gx_dps ?? 0);
  const gy = Number(r.gy ?? r.gy_dps ?? 0);
  const gz = Number(r.gz ?? r.gz_dps ?? 0);

  return {
    ts_utc: ts, id: r.id ?? id,
    ax, ay, az, gx, gy, gz,
    ax_g: r.ax_g ?? ax, ay_g: r.ay_g ?? ay, az_g: r.az_g ?? az,
    gx_dps: r.gx_dps ?? gx, gy_dps: r.gy_dps ?? gy, gz_dps: r.gz_dps ?? gz,
    temp_c: r.temp_c ?? null,
  };
}
export const getMpuLatest = getLatestMPU;

export type MpuHistoryRow = { ts: string; ax: number; ay: number; az: number; gx?: number; gy?: number; gz?: number };

export async function getMPUHistory(
  id: number | "MPUA1" | "MPUA2" | string,
  since: string = "-10m",
  limit: number = 2000,
  asc: boolean = true
): Promise<MpuHistoryRow[]> {
  const asStr = String(id);
  const qs = new URLSearchParams({ id: asStr, since, limit: String(limit), ...(asc ? { asc: "1" } : {}) });

  let raw: any;
  try {
    raw = await fetchJson<any>(`/mpu/history?${qs.toString()}`);
  } catch {
    try {
      raw = await fetchJson<any>(`/api/mpu/history?${qs.toString()}`);
    } catch {
      return [];
    }
  }

  const items: any[] = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  return items.map((r) => ({
    ts: String(r.ts_utc ?? r.ts ?? r.timestamp ?? r.time ?? new Date().toISOString()),
    ax: Number(r.ax ?? r.ax_g ?? r.x ?? 0),
    ay: Number(r.ay ?? r.ay_g ?? r.y ?? 0),
    az: Number(r.az ?? r.az_g ?? r.z ?? 0),
    gx: (r.gx ?? r.gx_dps) != null ? Number(r.gx ?? r.gx_dps) : undefined,
    gy: (r.gy ?? r.gy_dps) != null ? Number(r.gy ?? r.gy_dps) : undefined,
    gz: (r.gz ?? r.gz_dps) != null ? Number(r.gz ?? r.gz_dps) : undefined,
  }));
}
export const getMpuHistory = getMPUHistory;

// --- Utilitários p/ “última amostra” MPU robusta ---
export type MpuSample = { ts: string; ax?: number; ay?: number; az?: number; gx?: number; gy?: number; gz?: number };

function normalizeMpuSample(raw: any): MpuSample | null {
  if (!raw) return null;
  const ts = String(raw.ts_utc ?? raw.ts ?? raw.timestamp ?? raw.time ?? new Date().toISOString());
  const ax = raw.ax_g ?? raw.ax ?? raw.x;
  const ay = raw.ay_g ?? raw.ay ?? raw.y;
  const az = raw.az_g ?? raw.az ?? raw.z;
  const gx = raw.gx_dps ?? raw.gx;
  const gy = raw.gy_dps ?? raw.gy;
  const gz = raw.gz_dps ?? raw.gz;
  return {
    ts,
    ax: ax != null ? Number(ax) : undefined,
    ay: ay != null ? Number(ay) : undefined,
    az: az != null ? Number(az) : undefined,
    gx: gx != null ? Number(gx) : undefined,
    gy: gy != null ? Number(gy) : undefined,
    gz: gz != null ? Number(gz) : undefined,
  };
}
function pickOneMpuSample(payload: any): any {
  if (!payload) return null;
  const p = (payload as any).items ?? (payload as any).data ?? payload;
  if (Array.isArray(p)) return p[0] ?? null;
  return p;
}

export async function getMpuLatestSafe(nameOrId: string): Promise<MpuSample | null> {
  const s = String(nameOrId).trim();
  const m = /^MPUA?(\d+)$/i.exec(s);
  const idName = m?.[1] ? `MPUA${m[1]}` : /^\d+$/.test(s) ? `MPUA${s}` : s.toUpperCase();

  const qsName = new URLSearchParams({ name: idName }).toString();
  const qsId = new URLSearchParams({ id: idName }).toString();

  const urls = [
    `/mpu/history?${qsName}`,
    `/mpu/history?${qsId}`,
    `/api/mpu/history?${qsName}`,
    `/api/mpu/history?${qsId}`,
  ];

  for (const url of urls) {
    try {
      const r = await fetchJson<any>(url);
      const one = pickOneMpuSample(r);
      const norm = normalizeMpuSample(one);
      if (norm && (norm.ax != null || norm.ay != null || norm.az != null)) return norm;
    } catch {
      // tenta próxima
    }
  }
  return null;
}
export async function getMpuLatestById(mpu_id: number): Promise<MpuSample | null> {
  return getMpuLatestSafe(`MPUA${String(mpu_id)}`);
}

// ===== Alerts =====
export type AlertItem = {
  id: number | string;
  code: string;
  type?: string;
  severity: number; // 1..5
  message: string;
  origin?: string; // A1/A2/S1/S2
  status?: "open" | "ack" | "closed";
  created_at: string; // ISO
  actuator_id?: number | null;
  value?: number | null;
  limit_value?: number | null;
  unit?: string | null;
  recommendations?: string[];
  causes?: string[];
};

export async function getAlerts(limit = 5): Promise<{ items: AlertItem[]; count: number }> {
  return fetchJson<{ items: AlertItem[]; count: number }>(`/alerts?limit=${limit}`);
}

// DASHBOARD (fast path)
export async function getActuatorsStateFast(): Promise<{
  ts: string;
  actuators: { actuator_id: 1|2; state: "RECUADO"|"AVANÇADO"; pending: "AV"|"REC"|null; fault: string; elapsed_ms: number; started_at: string|null }[];
}> {
  const bust = Date.now();
  return fetchJson(`/api/live/actuators/state?_=${bust}`);
}

export async function fetchJsonAbortable<T = any>(path: string, signal: AbortSignal): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText} on ${url}`);
  return (await res.json()) as T;
}

export async function getActuatorsStateFastAbortable(signal: AbortSignal) {
  const bust = Date.now();
  return fetchJsonAbortable(`/api/live/actuators/state2?_=${bust}`, signal);
}
