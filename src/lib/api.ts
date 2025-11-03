// src/lib/api.ts — WS-first com fallback HTTP (compat total)

/* ======================
   Base e utilitário HTTP
   ====================== */
export const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (import.meta as any)?.env?.VITE_API_URL ||
  "http://localhost:8000";

export function getApiBase() {
  return API_BASE;
}

// ---- timeouts e helpers
function withTimeout(init: RequestInit = {}, timeoutMs = 8000): RequestInit {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  return { ...init, signal: ctrl.signal, ...({ __timeoutId: id } as any) };
}
async function finalize(res: Response, url: string, init: RequestInit) {
  try {
    if ((init as any).__timeoutId) clearTimeout((init as any).__timeoutId);
  } catch {}
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText} on ${url}`);
  return res;
}

export async function fetchJson<T = any>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const i = withTimeout({ cache: "no-store", ...(init || {}) }, init?.timeoutMs ?? 8000);
  const res = await fetch(url, i).then((r) => finalize(r, url, i));
  return (await res.json()) as T;
}

export async function postJson<T = any>(
  path: string,
  body: any,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const i = withTimeout(
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
      body: JSON.stringify(body ?? {}),
      ...(init || {}),
    },
    init?.timeoutMs ?? 8000
  );
  const res = await fetch(url, i).then((r) => finalize(r, url, i));
  return (await res.json()) as T;
}

// helper genérico que tenta múltiplas URLs/métodos
async function fetchFirstOk<T>(candidates: Array<{ url: string; init?: RequestInit }>): Promise<T> {
  let lastErr: any;
  for (const c of candidates) {
    try {
      return await fetchJson<T>(c.url, c.init);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/* ======================
   Tipos (existentes + ajustes p/ live.mpu)
   ====================== */
export type StableState = "RECUADO" | "AVANÇADO" | "DESCONHECIDO";
export type PendingTarget = "AV" | "REC" | null;
export type Fault = "NONE" | "FAULT_TIMEOUT" | "FAULT_SENSORS_CONFLICT";

export type LatchedActuator = {
  actuator_id: 1 | 2;
  state: StableState;
  pending: PendingTarget;
  fault: Fault | string;
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

export type ActuatorsCpmResp = {
  ts: string;
  actuators: { id: number; window_s: number; cycles: number; cpm: number }[];
};

export type CyclesRateResp = {
  window_seconds: number;
  pairs_count: number;
  cycles: number;
  cycles_per_second: number;
};

export type VibrationLiveItem = {
  mpu_id: number;
  ts_start?: string;
  ts_end?: string;
  rms_ax?: number;
  rms_ay?: number;
  rms_az?: number;
  overall: number;
};
export type VibrationLiveResp = { items: VibrationLiveItem[] };

export type ActuatorTimingsResp = {
  actuators: {
    actuator_id: number;
    last: {
      ts_utc?: string | null;
      dt_abre_s: number | null;
      dt_fecha_s: number | null;
      dt_ciclo_s: number | null;
    };
  }[];
};

export type SystemStatusResp = {
  components?: { actuators?: string; sensors?: string; transmission?: string; control?: string };
};

export type HealthResp = {
  status: "ok" | "degraded" | "offline" | string;
  started_at?: string;
};

/* ======================
   Dashboard (Live / etc.)
   ====================== */

// WS-first: preferimos o snapshot novo /api/live/snapshot
export async function getActuatorsState(): Promise<LatchedResp> {
  try {
    const snap = await fetchJson<any>("/api/live/snapshot");
    const ts = String(snap?.ts ?? new Date().toISOString());
    const items = Array.isArray(snap?.actuators) ? snap.actuators : [];
    const actuators: LatchedActuator[] = items
      .map((a: any) => ({
        actuator_id: Number(a.id ?? a.actuator_id),
        state: (a.state ?? "DESCONHECIDO") as StableState,
        pending: (a.pending ?? null) as PendingTarget,
        fault: (a.fault ?? "NONE") as any,
        elapsed_ms: Number(a.elapsed_ms ?? 0),
        started_at: a.started_at ?? null,
      }))
      .filter((x: any) => Number.isFinite(x.actuator_id));
    return { ts, actuators };
  } catch {
    // Fallbacks legados (se existirem no ambiente)
    const bust = Date.now();
    try {
      return await fetchJson<LatchedResp>(`/api/live/actuators/state-mon?_=${bust}`);
    } catch {
      return await fetchJson<LatchedResp>(`/api/live/actuators/state?_=${bust}`);
    }
  }
}
export const getLatchedActuators = getActuatorsState;

// (opcional/legado) — agora adaptado ao snapshot
export async function getActuatorsStateFast(): Promise<{
  ts: string;
  actuators: {
    actuator_id: 1 | 2;
    state: "RECUADO" | "AVANÇADO" | "DESCONHECIDO";
    pending: "AV" | "REC" | null;
    fault: string;
    elapsed_ms: number;
    started_at: string | null;
  }[];
}> {
  const snap = await getActuatorsState();
  return {
    ts: snap.ts,
    actuators: (snap.actuators || []) as any,
  };
}

/** === Novo helper: pega o agregado leve do MPU enviado no /api/live/snapshot === */
export type LiveMpuItem = { id: number; rms: number };
export async function getLiveMpuRms(): Promise<{ ts: string; items: LiveMpuItem[] }> {
  try {
    const snap = await fetchJson<any>("/api/live/snapshot");
    const ts = String(snap?.ts ?? new Date().toISOString());
    const items: LiveMpuItem[] = Array.isArray(snap?.mpu)
      ? snap.mpu
          .map((m: any) => ({ id: Number(m.id), rms: Number(m.rms ?? m.overall ?? 0) }))
          .filter((x: any) => Number.isFinite(x.id))
      : [];
    return { ts, items };
  } catch {
    // Sem live snapshot, tenta monitoring snapshot (tem vib. overall por mpu)
    try {
      const mon = await fetchJson<any>("/api/monitoring/snapshot");
      const ts = String(mon?.ts ?? new Date().toISOString());
      const items: LiveMpuItem[] = Array.isArray(mon?.vibration?.items)
        ? mon.vibration.items.map((it: any) => ({ id: Number(it.mpu_id), rms: Number(it.overall ?? 0) }))
        : [];
      return { ts, items };
    } catch {
      return { ts: new Date().toISOString(), items: [] };
    }
  }
}

/* ===== OPC: candidatos de rotas (by-name e by-facet) ===== */
function opcCandidatesByName(qs: string, name: string, since: string, limit: number, asc: boolean) {
  const body = JSON.stringify({ name, since, limit, asc });
  return [
    { url: `/api/opc/history/name?${qs}` },
    { url: `/opc/history/name?${qs}` },
    { url: `/api/opc/by-name?${qs}` },
    { url: `/opc/by-name?${qs}` },
    { url: `/api/opc/query?${qs}` },
    { url: `/opc/query?${qs}` },
    { url: `/api/opc/history?${qs}` },
    { url: `/opc/history?${qs}` },

    { url: `/api/opc/history/name`, init: { method: "POST", headers: { "Content-Type": "application/json" }, body } },
    { url: `/opc/history/name`,     init: { method: "POST", headers: { "Content-Type": "application/json" }, body } },
    { url: `/api/opc/by-name`,      init: { method: "POST", headers: { "Content-Type": "application/json" }, body } },
    { url: `/opc/by-name`,          init: { method: "POST", headers: { "Content-Type": "application/json" }, body } },
    { url: `/api/opc/history`,      init: { method: "POST", headers: { "Content-Type": "application/json" }, body } },
    { url: `/opc/history`,          init: { method: "POST", headers: { "Content-Type": "application/json" }, body } },
  ];
}

function opcCandidatesByFacet(qs: string, act: number, facet: "S1"|"S2", since: string, asc: boolean) {
  const body = JSON.stringify({ act, facet, since, asc });
  return [
    { url: `/api/opc/history/facet?${qs}` },
    { url: `/opc/history/facet?${qs}` },
    { url: `/api/opc/by-facet?${qs}` },
    { url: `/opc/by-facet?${qs}` },
    { url: `/api/opc/query?${qs}` },
    { url: `/opc/query?${qs}` },
    { url: `/api/opc/history?${qs}` },
    { url: `/opc/history?${qs}` },

    { url: `/api/opc/history/facet`, init: { method: "POST", headers: { "Content-Type": "application/json" }, body } },
    { url: `/opc/history/facet`,     init: { method: "POST", headers: { "Content-Type": "application/json" }, body } },
    { url: `/api/opc/by-facet`,      init: { method: "POST", headers: { "Content-Type": "application/json" }, body } },
    { url: `/opc/by-facet`,          init: { method: "POST", headers: { "Content-Type": "application/json" }, body } },
    { url: `/api/opc/history`,       init: { method: "POST", headers: { "Content-Type": "application/json" }, body } },
    { url: `/opc/history`,           init: { method: "POST", headers: { "Content-Type": "application/json" }, body } },
  ];
}

export async function getCyclesTotal(): Promise<CyclesTotalResp> {
  return fetchJson<CyclesTotalResp>(`/api/live/cycles/total`);
}

/* ======================
   Monitoring (HTTP compat via snapshot)
   ====================== */
export async function getCyclesRate60s(windowS: number = 60): Promise<CyclesRateResp> {
  try {
    const snap = await fetchJson<any>("/api/slow/snapshot");
    const items = Array.isArray(snap?.items) ? snap.items : [];
    const sumCycles = items.reduce((acc: number, it: any) => acc + Number(it.cycles ?? 0), 0);
    const sumCpm = items.reduce((acc: number, it: any) => acc + Number(it.cpm ?? 0), 0);
    const win = Number(snap?.window_s ?? windowS);
    return {
      window_seconds: win,
      pairs_count: sumCycles,
      cycles: sumCycles,
      cycles_per_second: win > 0 ? sumCpm / 60.0 : 0,
    };
  } catch {
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
}

export async function getVibrationLive(windowS: number = 2): Promise<VibrationLiveResp> {
  try {
    const snap = await fetchJson<any>("/api/monitoring/snapshot");
    const items: VibrationLiveItem[] = ((snap?.vibration?.items ?? []) as any[])
      .filter(Boolean)
      .map((it) => ({
        mpu_id: Number(it.mpu_id),
        overall: Number(it.overall ?? 0),
      }));
    return { items };
  } catch {
    const r = await fetchJson<any>(`/api/live/vibration?window_s=${windowS}`);
    const items: VibrationLiveItem[] = ((r?.items ?? []) as any[])
      .filter(Boolean)
      .map((it) => ({ mpu_id: Number(it.mpu_id), overall: Number(it.overall ?? 0) }));
    return { items };
  }
}

export async function getActuatorTimings(): Promise<ActuatorTimingsResp> {
  try {
    const snap = await fetchJson<any>("/api/monitoring/snapshot");
    const timings = Array.isArray(snap?.timings) ? snap.timings : [];
    return { actuators: timings };
  } catch {
    return fetchJson<ActuatorTimingsResp>(`/api/live/actuators/timings`);
  }
}

/* ======================
   System status / Health
   ====================== */
export async function getSystemStatus(): Promise<SystemStatusResp> {
  try {
    const h = await fetchJson<HealthResp>("/api/health");
    return { components: { actuators: h.status, sensors: h.status, transmission: h.status, control: h.status } };
  } catch {
    return {};
  }
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

/* ======================
   Analytics (compat OPC)
   ====================== */
export type OPCHistoryRow = { ts: string; value: number | boolean | string | null | undefined };

function toBool01(v: any): 0 | 1 {
  if (v === true || v === "true" || v === "True" || v === "TRUE") return 1;
  if (v === false || v === "false" || v === "False" || v === "FALSE") return 0;
  if (v === 1 || v === "1") return 1;
  if (v === 0 || v === "0") return 0;
  const n = Number(v);
  if (Number.isFinite(n)) return n > 0 ? 1 : 0;
  return 0;
}

async function opcSinceVariants(actuatorId: number, facet: "S1" | "S2", since: string, asc = true) {
  const variants = since.startsWith("-") ? [since, "-120m", "-2h", "-7200s"] : [since];
  for (const s of variants) {
    const qs = new URLSearchParams({ act: String(actuatorId), facet, since: s, ...(asc ? { asc: "1" } : {}) }).toString();
    try {
      const raw = await fetchFirstOk<any>(opcCandidatesByFacet(qs, actuatorId, facet, s, asc));
      const arr = (Array.isArray(raw) ? raw : raw?.items) ?? [];
      if (arr.length) {
        if (typeof window !== "undefined") console.info(`[opcSinceVariants] facet=${facet} since=${s} -> ${arr.length}`);
        return arr as any[];
      }
    } catch {}
  }
  if (typeof window !== "undefined") console.warn(`[opcSinceVariants] facet=${facet} sem dados nas variantes`);
  return [] as any[];
}

export async function getOPCHistory(params: {
  actuatorId: number;
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
  } catch {}
  const name =
    params.facet === "S1" ? `Recuado_${params.actuatorId}S1` : `Avancado_${params.actuatorId}S2`;
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
    const qs = new URLSearchParams({ name, since: s, limit: String(limit), ...(asc ? { asc: "1" } : {}) }).toString();
    try {
      const raw = await fetchFirstOk<any>(opcCandidatesByName(qs, name, s, limit, asc));
      const arr = (Array.isArray(raw) ? raw : raw?.items) ?? [];
      if (arr.length) {
        if (typeof window !== "undefined") console.info(`[getOPCHistoryByName] ${name} ${s} -> ${arr.length}`);
        return (arr as any[]).map((r) => ({
          ts: String(r.ts_utc ?? r.ts ?? r.time ?? new Date().toISOString()),
          value: r.value_bool ?? r.value ?? r.v ?? 0,
        }));
      }
    } catch {}
  }
  return [];
}

/* ======================
   Analytics – minute-agg (normalizador)
   ====================== */
export type MinuteAgg = {
  minute: string;
  t_open_ms_avg: number | null;
  t_close_ms_avg: number | null;
  t_cycle_ms_avg: number | null;
  runtime_s: number;
  cpm: number;
  vib_avg?: number | null;
};

function normalizeMinuteAggRow(r: any): MinuteAgg | null {
  if (!r) return null;
  const minute = r.minute ?? r.ts ?? r.bucket_start ?? r.bucket ?? r.time ?? r.t ?? new Date().toISOString();
  const t_open_ms_avg = r.t_open_ms_avg ?? r.to_ms_avg ?? r.open_ms_avg ?? null;
  const t_close_ms_avg = r.t_close_ms_avg ?? r.tf_ms_avg ?? r.close_ms_avg ?? null;
  const t_cycle_ms_avg = r.t_cycle_ms_avg ?? r.tc_ms_avg ?? r.cycle_ms_avg ?? null;
  let runtime_s =
    r.runtime_s ?? r.runtime ?? (typeof r.runtime_ms === "number" ? r.runtime_ms / 1000 : undefined) ?? 0;
  runtime_s = Number(runtime_s);
  if (!Number.isFinite(runtime_s)) runtime_s = 0;
  runtime_s = Math.max(0, Math.min(60, runtime_s));
  let cpm =
    r.cpm ??
    r.cpm_avg ??
    r.cpm_sum ??
    r.cycles ??
    (typeof r.cps === "number" ? r.cps * 60 : undefined) ??
    r.value ??
    0;
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
  payload?.data ||
  payload?.items ||
  payload?.rows ||
  payload?.results ||
  payload?.records ||
  [];

// tenta várias formas de query aceitas pelo backend (SEM fallback vazio)
async function tryMinuteAggMany(act: "A1" | "A2", since: string): Promise<MinuteAgg[]> {
  const id = act === "A1" ? "1" : "2";
  const combos: Array<Record<string, string>> = [
    { actuator: id },
    { id },
    { act: id },
  ];

  for (const a of combos) {
    const qs = new URLSearchParams({ ...a, since }).toString();
    const url = `/metrics/minute-agg?${qs}`;
    try {
      const raw = await fetchJson<any>(url);
      const arr =
        (Array.isArray(raw) && raw) ||
        raw?.data || raw?.items || raw?.rows || raw?.results || raw?.records || [];
      if (Array.isArray(arr) && arr.length) {
        const out = arr.map(normalizeMinuteAggRow).filter(Boolean) as MinuteAgg[];
        if (out.length) return out.sort((x, y) => x.minute.localeCompare(y.minute));
      }
    } catch {}
  }
  return [];
}

export async function getMinuteAgg(act: "A1" | "A2", since: string): Promise<MinuteAgg[]> {
  return tryMinuteAggMany(act, since);
}

/* ======================
   CPM × Runtime (via OPC — fallback robusto)
   ====================== */
export type CpmRuntimeMinuteRow = { minute: string; cpm: number | null; runtime_s: number | null };
type MinuteMapNum = Map<string, number>;
const toMinuteIsoUTC = (d: Date) =>
  new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), 0, 0)
  ).toISOString();
const actLabelToId = (act: "A1" | "A2"): 1 | 2 => (act === "A1" ? 1 : 2);

async function cpmFromOpcByMinute(act: "A1" | "A2", since: string): Promise<MinuteMapNum> {
  const id = actLabelToId(act);

  // 1) normaliza para array sempre
  const rows: OPCHistoryRow[] = await getOPCHistory({ actuatorId: id, facet: "S2", since, asc: true })
    .then(r => (Array.isArray(r) ? r : []))
    .catch(() => [] as OPCHistoryRow[]);

  const map: MinuteMapNum = new Map();

  // começa em 1; 2) checa limites e 3) faz narrowing (TS-safe)
  for (let i = 1; i < rows.length; i++) {
    const prevRow = rows[i - 1];
    const currRow = rows[i];
    if (!prevRow || !currRow) continue;

    const prev = toBool01((prevRow as any).value);
    const curr = toBool01((currRow as any).value);
    if (prev === 0 && curr === 1) {
      const key = toMinuteIsoUTC(new Date((currRow as OPCHistoryRow).ts));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return map;
}

async function runtimeFromOpcByMinute(act: "A1" | "A2", since: string): Promise<MinuteMapNum> {
  const id = actLabelToId(act);

  const rows: OPCHistoryRow[] = await getOPCHistory({ actuatorId: id, facet: "S2", since, asc: true })
    .then(r => (Array.isArray(r) ? r : []))
    .catch(() => [] as OPCHistoryRow[]);

  const out: MinuteMapNum = new Map();
  if (rows.length === 0) return out;

  for (let i = 0; i < rows.length; i++) {
    const curr = rows[i];
    if (!curr) continue;
    const v = toBool01((curr as any).value);
    if (!v) continue;

    const t0 = new Date((curr as OPCHistoryRow).ts).getTime();
    const next = i + 1 < rows.length ? rows[i + 1] : undefined;
    const t1 = next ? new Date((next as OPCHistoryRow).ts).getTime() : Date.now();

    let t = t0;
    while (t < t1) {
      const d = new Date(t);
      const key = toMinuteIsoUTC(d);

      const endOfMinute = new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          d.getUTCHours(),
          d.getUTCMinutes(),
          59,
          999
        )
      ).getTime();

      const chunkEnd = Math.min(endOfMinute + 1, t1);
      const sec = Math.max(0, Math.min(60, (chunkEnd - t) / 1000));
      out.set(key, Math.min(60, (out.get(key) ?? 0) + sec));
      t = chunkEnd;
    }
  }
  return out;
}

export async function getCpmRuntimeMinute(
  act: "A1" | "A2",
  since: string = "-120m"
): Promise<CpmRuntimeMinuteRow[]> {
  const minuteAgg = await tryMinuteAggMany(act, since).catch(() => [] as MinuteAgg[]);
  if (minuteAgg.length) {
    const rows = minuteAgg
      .map((r) => ({ minute: r.minute, cpm: r.cpm ?? 0, runtime_s: r.runtime_s ?? 0 }))
      .sort((a, b) => a.minute.localeCompare(b.minute));
    if (typeof window !== "undefined")
      console.info(`[getCpmRuntimeMinute][${act}] via minute-agg -> ${rows.length}`);
    return rows;
  }
  const [cpmMap, rtMap] = await Promise.all([
    cpmFromOpcByMinute(act, since),
    runtimeFromOpcByMinute(act, since),
  ]);
  const keys = new Set<string>([...cpmMap.keys(), ...rtMap.keys()]);
  const rows: CpmRuntimeMinuteRow[] = [];
  for (const k of keys) rows.push({ minute: k, cpm: cpmMap.get(k) ?? 0, runtime_s: rtMap.get(k) ?? 0 });
  rows.sort((a, b) => a.minute.localeCompare(b.minute));
  if (typeof window !== "undefined") console.info(`[getCpmRuntimeMinute][${act}] via OPC -> ${rows.length}`);
  return rows;
}

/* ======================
   LiveContext helpers (system + actuators + mpu)
   ====================== */
export async function getLiveActuatorsState(): Promise<{
  ts: string;
  system: { status: string };
  actuators: any[];
  mpu?: LiveMpuItem[];
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
    const data = await fetchJson<any>("/api/live/snapshot");
    let status = "unknown";
    try {
      const h = await getHealth();
      status = String(h?.status ?? "unknown").toLowerCase();
    } catch {}
    const arr = Array.isArray(data?.actuators) ? data.actuators : [];
    const actuators = arr.map(normAct).filter(Boolean);
    const mpu: LiveMpuItem[] = Array.isArray(data?.mpu)
      ? data.mpu.map((m: any) => ({ id: Number(m.id), rms: Number(m.rms ?? m.overall ?? 0) }))
      : [];
    return { ts: String(data?.ts ?? new Date().toISOString()), system: { status }, actuators, mpu };
  } catch {
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
      return { ts: String(data?.ts ?? new Date().toISOString()), system: { status }, actuators };
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
}

/* ---- MPU helpers (existentes) ---- */
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

export type MpuLatestCompat = {
  ts_utc: string;
  id: string | number;
  ax: number;
  ay: number;
  az: number;
  gx?: number;
  gy?: number;
  gz?: number;
  ax_g?: number | null;
  ay_g?: number | null;
  az_g?: number | null;
  gx_dps?: number | null;
  gy_dps?: number | null;
  gz_dps?: number | null;
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
    ts_utc: ts,
    id: r.id ?? id,
    ax,
    ay,
    az,
    gx,
    gy,
    gz,
    ax_g: r.ax_g ?? ax,
    ay_g: r.ay_g ?? ay,
    az_g: r.az_g ?? az,
    gx_dps: r.gx_dps ?? gx,
    gy_dps: r.gy_dps ?? gy,
    gz_dps: r.gz_dps ?? gz,
    temp_c: r.temp_c ?? null,
  };
}
export const getMpuLatest = getLatestMPU;

export type MpuHistoryRow = {
  ts: string;
  ax: number;
  ay: number;
  az: number;
  gx?: number;
  gy?: number;
  gz?: number;
};

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
  const idName = m?.[1] ? `MPUA${m?.[1]}` : /^\d+$/.test(s) ? `MPUA${s}` : s.toUpperCase();
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
    } catch {}
  }
  return null;
}
export async function getMpuLatestById(mpu_id: number): Promise<MpuSample | null> {
  return getMpuLatestSafe(`MPUA${String(mpu_id)}`);
}

/* ===== Alerts ===== */
export type AlertItem = {
  id: number | string;
  code: string;
  type?: string;
  severity: number;
  message: string;
  origin?: string;
  status?: "open" | "ack" | "closed";
  created_at: string;
  actuator_id?: number | null;
  value?: number | null;
  limit_value?: number | null;
  unit?: string | null;
  recommendations?: string[];
  causes?: string[];
};

/* === Alerts (com cache condicional ETag/Last-Modified) === */
let __alerts_cache: {
  etag?: string;
  lastModified?: string;
  payload?: { items: AlertItem[]; count?: number } | null;
} = {};

export async function getAlerts(limit = 5): Promise<{ items: AlertItem[]; count: number }> {
  const url = `/alerts?limit=${limit}`;
  const full = url.startsWith("http") ? url : `${API_BASE}${url}`;

  const headers: Record<string, string> = {};
  // Normaliza para `"etag"` (com aspas), pois o back compara sem/como aspas.
  if (__alerts_cache.etag) headers["If-None-Match"] = `"${__alerts_cache.etag.replace(/^W\/|"/g, "")}"`;
  if (__alerts_cache.lastModified) headers["If-Modified-Since"] = __alerts_cache.lastModified;

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 8000);
  let res: Response;
  try {
    res = await fetch(full, { method: "GET", headers, cache: "no-cache", signal: ctrl.signal });
  } finally {
    clearTimeout(to);
  }

  if (res.status === 304 && __alerts_cache.payload) {
    const p = __alerts_cache.payload;
    return { items: p.items ?? [], count: Number.isFinite(p.count) ? (p.count as number) : (p.items?.length ?? 0) };
  }
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText} on ${url}`);

  const data = (await res.json()) as any;
  const raw = res.headers.get("etag") || undefined;
  // guarda só o miolo do etag para reuso (sem W/ e sem aspas)
  if (raw) __alerts_cache.etag = raw.replace(/^W\//, "").replace(/"/g, "");
  const lastMod = res.headers.get("last-modified") || undefined;
  if (lastMod) __alerts_cache.lastModified = lastMod;
  __alerts_cache.payload = data;

  return {
    items: Array.isArray(data?.items) ? data.items : [],
    count: Number.isFinite(data?.count) ? data.count : (Array.isArray(data?.items) ? data.items.length : 0),
  };
}

/* ============================================================================
   =======================   WEBSOCKET CLIENTS   ==============================
   ============================================================================ */

// Mensagens WS (contratos novos)
export type WSMessageLive = {
  type: "live";
  ts: string;
  actuators: { id: number; state: StableState; pending?: PendingTarget }[];
  mpu?: { id: number; rms: number }[];
};
export type WSMessageMonitoring = {
  type: "monitoring";
  ts: string;
  timings: {
    actuator_id: number;
    last: { dt_abre_s: number | null; dt_fecha_s: number | null; dt_ciclo_s: number | null };
  }[];
  vibration: { window_s: number; items: { mpu_id: number; overall: number }[] };
};
export type WSMessageCPM = { type: "cpm"; ts: string; window_s: number; items: { id: number; cpm: number; window_s: number }[] };
export type WSMessageAlert = { type: "alert"; ts: string; code: string; severity: number; origin?: string; message: string };
export type WSHeartbeat = { type: "hb"; ts: string; channel?: string };
export type WSError = { type: "error"; channel?: string; detail: string; ts?: string };

// NOVO: snapshot de alerts enviado no on-open de /ws/alerts
export type WSMessageAlertsSnapshot = {
  type: "alerts";
  ts: string;
  items: {
    id?: number | string;
    code: string;
    severity: number;
    origin?: string;
    message: string;
    status?: "open" | "ack" | "closed";
    actuator_id?: number | null;
    details?: any;
  }[];
};

export type AnyWSMessage =
  | WSMessageLive
  | WSMessageMonitoring
  | WSMessageCPM
  | WSMessageAlert
  | WSMessageAlertsSnapshot
  | WSHeartbeat
  | WSError;

export type WSHandlers = {
  onMessage?: (msg: AnyWSMessage) => void;
  onOpen?: (ev: Event) => void;
  onClose?: (ev: CloseEvent) => void;
  onError?: (ev: Event) => void;
};

export type WSOptions = {
  manageVisibility?: boolean; // pausa quando hidden e retoma quando visible
  fallbackSnapshot?: "live" | "monitoring" | null; // liga polling de snapshot quando sem WS
  fallbackIntervalMs?: number; // 200 para live, 2000 para monitoring
  maxBackoffMs?: number; // 10000 por padrão
};

function wsUrl(path: string) {
  const base = getApiBase();
  const u = new URL(path.startsWith("/") ? path : `/${path}`, base);
  u.protocol = u.protocol.replace("http", "ws");
  return u.toString();
}

export type WSHandle = {
  pause(): void;
  resume(): void;
  close(code?: number, reason?: string): void;
  isOpen(): boolean;
  /** socket atual (ou null se pausado/fechado) */
  socket(): WebSocket | null;
};

type InternalState = {
  url: string;
  handlers: WSHandlers;
  opts: Required<WSOptions>;
  ws: WebSocket | null;
  intentionallyClosed: boolean;
  paused: boolean;
  backoffMs: number;
  fallbackTimer: number | null;
  visHandler?: (() => void) | null;
};

const DEFAULT_WS_OPTS: Required<WSOptions> = {
  manageVisibility: true,
  fallbackSnapshot: null,
  fallbackIntervalMs: 2000,
  maxBackoffMs: 10000,
};

function startSnapshotFallback(
  kind: "live" | "monitoring",
  everyMs: number,
  onMessage: (m: AnyWSMessage) => void
): number {
  const tick = async () => {
    try {
      if (kind === "live") {
        const p = await fetchJson<any>("/api/live/snapshot");
        onMessage({
          type: "live",
          ts: String(p?.ts ?? new Date().toISOString()),
          actuators: (p?.actuators ?? []).map((a: any) => ({
            id: Number(a.id ?? a.actuator_id),
            state: a.state,
            pending: a.pending ?? null,
          })),
          mpu: Array.isArray(p?.mpu)
            ? p.mpu
                .map((m: any) => ({ id: Number(m.id), rms: Number(m.rms ?? m.overall ?? 0) }))
                .filter((x: any) => Number.isFinite(x.id))
            : [],
        } as WSMessageLive);
      } else {
        const p = await fetchJson<any>("/api/monitoring/snapshot");
        const ts = String(p?.ts ?? new Date().toISOString());
        const timings = Array.isArray(p?.timings) ? p.timings : [];
        const vibItems = Array.isArray(p?.vibration?.items) ? p.vibration.items : [];
        onMessage({
          type: "monitoring",
          ts,
          timings,
          vibration: {
            window_s: Number(p?.vibration?.window_s ?? 2),
            items: vibItems
              .filter((it: any) => it && it.mpu_id != null)
              .map((it: any) => ({ mpu_id: Number(it.mpu_id), overall: Number(it.overall ?? 0) })),
          },
        } as WSMessageMonitoring);
      }
    } catch {}
  };
  // @ts-ignore
  const id = typeof window !== "undefined" ? window.setInterval(tick, everyMs) : (0 as any);
  tick(); // primeiro preenchimento
  return id as unknown as number;
}

function clearFallbackTimer(state: InternalState) {
  if (state.fallbackTimer != null && typeof window !== "undefined") {
    // @ts-ignore
    window.clearInterval(state.fallbackTimer);
    state.fallbackTimer = null;
  }
}

function openWS(path: string, handlers: WSHandlers = {}, options: WSOptions = {}): WSHandle {
  const state: InternalState = {
    url: wsUrl(path),
    handlers,
    opts: { ...DEFAULT_WS_OPTS, ...options },
    ws: null,
    intentionallyClosed: false,
    paused: false,
    backoffMs: 250,
    fallbackTimer: null,
    visHandler: null,
  };

  const openSocket = () => {
    if (state.paused || state.intentionallyClosed) return;
    try {
      const ws = new WebSocket(state.url);
      state.ws = ws;

      ws.onopen = (ev) => {
        state.backoffMs = 250;
        clearFallbackTimer(state);
        state.handlers.onOpen?.(ev);
      };

      ws.onerror = (ev) => {
        state.handlers.onError?.(ev);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          state.handlers.onMessage?.(msg);
        } catch {}
      };

      ws.onclose = (ev) => {
        state.handlers.onClose?.(ev);
        state.ws = null;
        if (!state.intentionallyClosed && !state.paused) {
          if (state.opts.fallbackSnapshot && state.fallbackTimer == null && typeof window !== "undefined") {
            const interval = state.opts.fallbackIntervalMs;
            state.fallbackTimer = startSnapshotFallback(
              state.opts.fallbackSnapshot,
              interval,
              (m) => state.handlers.onMessage?.(m)
            );
          }
          const next = state.backoffMs;
          state.backoffMs = Math.min(state.opts.maxBackoffMs, Math.floor(state.backoffMs * 1.8));
          if (typeof window !== "undefined") {
            // @ts-ignore
            window.setTimeout(() => {
              if (!state.paused && !state.intentionallyClosed) openSocket();
            }, next);
          }
        }
      };
    } catch {
      if (!state.intentionallyClosed && !state.paused && typeof window !== "undefined") {
        const next = state.backoffMs;
        state.backoffMs = Math.min(state.opts.maxBackoffMs, Math.floor(state.backoffMs * 1.8));
        // @ts-ignore
        window.setTimeout(() => openSocket(), next);
      }
    }
  };

  if (state.opts.manageVisibility && typeof document !== "undefined") {
    state.visHandler = () => {
      const hidden = document.visibilityState === "hidden";
      if (hidden) api.pause();
      else api.resume();
    };
    document.addEventListener("visibilitychange", state.visHandler);
  }

  openSocket();

  const api: WSHandle = {
    pause() {
      state.paused = true;
      clearFallbackTimer(state);
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        try {
          state.ws.close(4900, "paused");
        } catch {}
      }
      state.ws = null;
    },
    resume() {
      if (!state.paused || state.intentionallyClosed) return;
      state.paused = false;
      clearFallbackTimer(state);
      state.backoffMs = 250;
      openSocket();
    },
    close(code = 1000, reason = "client-close") {
      state.intentionallyClosed = true;
      clearFallbackTimer(state);
      if (state.visHandler && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", state.visHandler);
        state.visHandler = null;
      }
      if (state.ws && state.ws.readyState <= WebSocket.CLOSING) {
        try {
          state.ws.close(code, reason);
        } catch {}
      }
      state.ws = null;
    },
    isOpen() {
      return !!state.ws && state.ws.readyState === WebSocket.OPEN;
    },
    socket() {
      return state.ws;
    },
  };

  return api;
}

// Facades específicas (com fallback configurado conforme o plano)
export function openLiveWS(handlers: WSHandlers): WSHandle {
  return openWS("/ws/live", handlers, {
    manageVisibility: true,
    fallbackSnapshot: null,   // removido: antes "live"
    fallbackIntervalMs: 0,
    maxBackoffMs: 10000,
  });
}

export function openMonitoringWS(handlers: WSHandlers): WSHandle {
  return openWS("/ws/monitoring", handlers, {
    manageVisibility: true,
    fallbackSnapshot: null,   // removido: antes "monitoring"
    fallbackIntervalMs: 0,
    maxBackoffMs: 10000,
  });
}

export function openSlowWS(handlers: WSHandlers): WSHandle {
  return openWS("/ws/slow", handlers, {
    manageVisibility: true,
    fallbackSnapshot: null,   // já não terá fallback
    fallbackIntervalMs: 0,
    maxBackoffMs: 10000,
  });
}

// NOVO: canal de Alerts (snapshot inicial + push on-change)
export function openAlertsWS(handlers: WSHandlers): WSHandle {
  // Este canal envia um snapshot inicial {type:"alerts", items:[...]} e depois "push" on-change.
  return openWS("/ws/alerts", handlers, {
    manageVisibility: true,
    fallbackSnapshot: null,       // sem fallback HTTP aqui; snapshot já vem no on-open
    fallbackIntervalMs: 0,
    maxBackoffMs: 10000,
  });
}

/* --- Alerts config --- */
export type AlertsConfig = {
  vibration_overall_threshold: number;
  latch_timeout_factor: number;
  expected_ms_A1?: number | null;
  expected_ms_A2?: number | null;
  vib_green: number;
  vib_amber: number;
  cpm_green: number;
  cpm_amber: number;
  updated_at?: string;
};

export async function getAlertsConfig(): Promise<AlertsConfig> {
  return fetchJson<AlertsConfig>("/api/alerts/config");
}

export async function updateAlertsConfig(patch: Partial<AlertsConfig>): Promise<AlertsConfig> {
  return fetchJson<AlertsConfig>("/api/alerts/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}
