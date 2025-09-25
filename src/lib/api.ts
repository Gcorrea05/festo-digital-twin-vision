// src/lib/api.ts — FINAL (misto: raiz + /api para /live/*)

export type OPCFacet = "S1" | "S2" | "V_AVANCO" | "V_RECUO" | "INICIA" | "PARA";

export type ActuatorLiveItem = {
  actuator_id: string;
  state: "AVANCADO" | "RECUADO" | "TRANSICAO";
  ts: string;
  recuado: 0 | 1;
  avancado: 0 | 1;
};
export type ActuatorsLiveResponse = { actuators: ActuatorLiveItem[] };

export type MPUDataRaw = {
  ts_utc?: string;
  ts?: string;
  id: string;
  ax?: number; ay?: number; az?: number;
  ax_g?: number; ay_g?: number; az_g?: number;
  gx?: number; gy?: number; gz?: number;
  gx_dps?: number; gy_dps?: number; gz_dps?: number;
  temp_c?: number;
};

// ---------------- Base helpers ----------------
function normalizeBase(u?: string): string | undefined {
  if (!u) return undefined;
  const s = String(u).trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(s) ? s : undefined;
}

export function getApiBase(): string {
  const envs = [
    (import.meta as any)?.env?.VITE_API_BASE,
    (import.meta as any)?.env?.VITE_API_URL,
    (import.meta as any)?.env?.VITE_API,
  ].map(normalizeBase).filter(Boolean) as string[];
  if (envs.length) return envs[0];
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

// URLs HTTP
function root(path: string) {
  const base = getApiBase();
  const right = path.startsWith("/") ? path : `/${path}`;
  return `${base}${right}`;
}
function api(path: string) {
  const base = getApiBase();
  const right = path.startsWith("/") ? path : `/${path}`;
  return `${base}/api${right}`;
}

type FetchOpts = RequestInit & { timeoutMs?: number; absolute?: boolean };

async function fetchJson<T>(urlOrPath: string, opts: FetchOpts = {}): Promise<T> {
  const { timeoutMs = 15000, absolute = false, ...init } = opts;
  const url = absolute ? urlOrPath : root(urlOrPath);

  const ctl = new AbortController();
  const t = window.setTimeout(() => ctl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: { Accept: "application/json", ...(init.headers || {}) },
      signal: ctl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API ${res.status} ${res.statusText} on ${res.url} :: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(t);
  }
}

// -------------- Health / System (RAIZ) --------------
export async function getHealth(): Promise<{ status: string }> {
  return fetchJson<{ status: string }>("/health");
}
export async function getSystem(): Promise<{ mode: string; severity: string; ts: number }> {
  try {
    const h = await getHealth();
    return {
      mode: h?.status === "ok" ? "ONLINE" : "OFFLINE",
      severity: h?.status === "ok" ? "green" : "red",
      ts: Date.now(),
    };
  } catch {
    return { mode: "OFFLINE", severity: "red", ts: Date.now() };
  }
}

// -------------- Actuators (HTTP, /api/live/*) --------------
export async function getLiveActuatorsState(): Promise<ActuatorsLiveResponse> {
  const url = api("/live/actuators/state");
  return fetchJson<ActuatorsLiveResponse>(url, { absolute: true });
}

type TimingRow = {
  ts_utc: string | null;
  dt_abre_s: number | null;
  dt_fecha_s: number | null;
  dt_ciclo_s: number | null;
};
export type ActuatorTimings = { actuator_id: number; last: TimingRow };

export async function getRuntime(): Promise<{ runtime_seconds: number; since: string | null }> {
  return fetchJson(api("/live/runtime"), { absolute: true });
}
export async function getActuatorTimings(): Promise<{ actuators: ActuatorTimings[] }> {
  return fetchJson<{ actuators: ActuatorTimings[] }>(api("/live/actuators/timings"), { absolute: true });
}
export async function getCpmByActuator(
  actuatorId: 1 | 2,
  windowSeconds = 60
): Promise<{ actuator_id: number; window_seconds: number; cycles: number; cpm: number }> {
  const qs = new URLSearchParams({ actuator_id: String(actuatorId), window_s: String(windowSeconds) });
  return fetchJson(api(`/live/cycles/rate_by_actuator?${qs.toString()}`), { absolute: true });
}
export async function getVibration(window_s: number = 2): Promise<any> {
  const params = new URLSearchParams({ window_s: String(window_s) });
  return fetchJson<any>(api(`/live/vibration?${params.toString()}`), { absolute: true });
}

// -------------- OPC (HTTP, RAIZ) --------------
type OPCHistoryRow = { ts_utc?: string; ts?: string; value?: number | string; value_bool?: boolean; value_num?: number };
export type OPCHistory = Array<{ ts: string; value: number }>;

function composeOpcName(actuatorId: number, facet: OPCFacet): string {
  if (facet === "S1") return `Recuado_${actuatorId}S1`;
  if (facet === "S2") return `Avancado_${actuatorId}S2`;
  return facet;
}
function normalizeOpcHistItem(rec: OPCHistoryRow): { ts: string; value: number } {
  const ts = String(rec.ts_utc ?? rec.ts ?? new Date().toISOString());
  let v = 0;
  if (rec.value_bool !== undefined) v = rec.value_bool ? 1 : 0;
  else if (rec.value !== undefined) v = Number(rec.value);
  else if (rec.value_num !== undefined) v = Number(rec.value_num);
  return { ts, value: Number.isFinite(v) ? v : 0 };
}

export async function getOPCLatest(
  actuatorId: number,
  facets: OPCFacet[] = ["S1", "S2"]
): Promise<Record<OPCFacet, 0 | 1>> {
  const out: Partial<Record<OPCFacet, 0 | 1>> = {};
  await Promise.all(
    facets.map(async (f) => {
      const name = composeOpcName(actuatorId, f);
      const url = root(`/opc/latest?name=${encodeURIComponent(name)}`);
      const item = await fetchJson<{ value_bool?: boolean; value?: number | string }>(url, { absolute: true });
      const v = item?.value_bool !== undefined ? (item.value_bool ? 1 : 0) : Number(item?.value ?? 0);
      out[f] = v ? 1 : 0;
    })
  );
  return out as Record<OPCFacet, 0 | 1>;
}

export async function getOPCHistory(opts: {
  actuatorId: number; facet: OPCFacet; since: string; limit?: number; asc?: boolean;
}): Promise<OPCHistory> {
  const { actuatorId, facet, since, limit = 1000, asc = false } = opts;
  const name = composeOpcName(actuatorId, facet);
  const params = new URLSearchParams();
  params.set("name", name);
  if (since) params.set("since", since);
  if (limit) params.set("limit", String(limit));
  if (asc) params.set("asc", "true");
  const url = root(`/opc/history?${params.toString()}`);
  const raw = await fetchJson<OPCHistoryRow[] | { items: OPCHistoryRow[] }>(url, { absolute: true });
  const rows = Array.isArray(raw) ? raw : raw.items;
  return rows.map(normalizeOpcHistItem);
}

// -------------- MPU (HTTP, RAIZ) --------------
export async function getMpuIds(): Promise<string[]> {
  return fetchJson<string[]>("/mpu/ids");
}
export async function getLatestMPU(id: string): Promise<MPUDataRaw> {
  const params = new URLSearchParams({ id });
  return fetchJson<MPUDataRaw>(`/mpu/latest?${params.toString()}`);
}
export async function getMPUHistory(opts: {
  id: string; since?: string; limit?: number; asc?: boolean;
}): Promise<MPUDataRaw[]> {
  const { id, since, limit = 1000, asc = true } = opts;
  const params = new URLSearchParams({ id, limit: String(limit), asc: asc ? "true" : "false" });
  if (since) params.set("since", since);
  return fetchJson<MPUDataRaw[]>(`/mpu/history?${params.toString()}`);
}

// -------------- Métricas (HTTP, RAIZ) --------------
export type MinuteAggRow = {
  minute: string;
  t_open_ms_avg: number | null;
  t_close_ms_avg: number | null;
  t_cycle_ms_avg: number | null;
  runtime_s: number;
  cpm: number;
  vib_avg?: number | null;
};
export async function getMinuteAgg(act: "A1" | "A2", since = "-60m"): Promise<MinuteAggRow[]> {
  const params = new URLSearchParams({ act, since });
  return fetchJson<MinuteAggRow[]>(`/metrics/minute-agg?${params.toString()}`);
}

// Debug opcional
export const __debug = { getApiBase, urlRoot: root, urlApi: api };
