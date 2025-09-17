// src/lib/api.ts

export type OPCFacet = "S1" | "S2" | "V_AVANCO" | "V_RECUO" | "INICIA" | "PARA";

export type ActuatorLiveItem = {
  actuator_id: string;
  state: "AVANCADO" | "RECUADO" | "TRANSICAO";
  ts: string;
  recuado: 0 | 1;
  avancado: 0 | 1;
};

export type ActuatorsLiveResponse = {
  actuators: ActuatorLiveItem[];
};

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

function getApiBase(): string {
  const env = import.meta.env?.VITE_API_BASE as string | undefined;
  if (env && /^https?:\/\//i.test(env)) return env.replace(/\/+$/, "");
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

async function fetchJson<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { Accept: "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText} on ${url}`);
  return (await res.json()) as T;
}

// ---------- Health ----------
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

// ---------- Actuators ----------
export async function getLiveActuatorsState(): Promise<ActuatorsLiveResponse> {
  return fetchJson<ActuatorsLiveResponse>("/api/live/actuators/state");
}

// ---------- OPC ----------
type OPCHistoryRow = { ts_utc?: string; ts?: string; value?: number | string; value_bool?: boolean; value_num?: number };

function composeOpcName(actuatorId: number, facet: OPCFacet): string {
  if (facet === "S1") return `Recuado_${actuatorId}S1`;
  if (facet === "S2") return `Avancado_${actuatorId}S2`;
  return facet;
}

function normalizeOpcHistItem(rec: OPCHistoryRow): { ts: string; value: number } {
  const ts = (rec.ts_utc ?? rec.ts) as string;
  let v = 0;
  if (rec.value_bool !== undefined) v = rec.value_bool ? 1 : 0;
  else if (rec.value !== undefined) v = Number(rec.value);
  else if (rec.value_num !== undefined) v = Number(rec.value_num);
  return { ts, value: v };
}

export async function getOPCLatest(
  actuatorId: number,
  facets: OPCFacet[] = ["S1", "S2"]
): Promise<Record<OPCFacet, 0 | 1>> {
  const out: Partial<Record<OPCFacet, 0 | 1>> = {};
  await Promise.all(
    facets.map(async (f) => {
      const name = composeOpcName(actuatorId, f);
      const item = await fetchJson<{ value_bool?: boolean; value?: number | string }>(
        `/opc/latest?name=${encodeURIComponent(name)}`
      );
      const v =
        item?.value_bool !== undefined
          ? (item.value_bool ? 1 : 0)
          : Number(item?.value ?? 0);
      out[f] = v ? 1 : 0;
    })
  );
  return out as Record<OPCFacet, 0 | 1>;
}

export async function getOPCHistory(opts: {
  actuatorId: number;
  facet: OPCFacet;
  since: string;
  limit?: number;
  asc?: boolean;
}): Promise<Array<{ ts: string; value: number }>> {
  const { actuatorId, facet, since, limit = 1000, asc = false } = opts;
  const name = composeOpcName(actuatorId, facet);
  const params = new URLSearchParams();
  params.set("name", name);
  if (since) params.set("since", since);
  if (limit) params.set("limit", String(limit));
  if (asc) params.set("asc", "true");
  const raw = await fetchJson<OPCHistoryRow[] | { items: OPCHistoryRow[] }>(
    `/opc/history?${params.toString()}`
  );
  const rows = Array.isArray(raw) ? raw : raw.items;
  return rows.map(normalizeOpcHistItem);
}

// ---------- MPU ----------
export async function getMpuIds(): Promise<string[]> {
  return fetchJson<string[]>("/mpu/ids");
}

export async function getLatestMPU(id: string): Promise<MPUDataRaw> {
  const params = new URLSearchParams();
  params.set("id", id);
  return fetchJson<MPUDataRaw>(`/mpu/latest?${params.toString()}`);
}

export async function getMPUHistory(opts: {
  id: string;
  since?: string;
  limit?: number;
  asc?: boolean;
}): Promise<MPUDataRaw[]> {
  const { id, since, limit = 1000, asc = true } = opts;
  const params = new URLSearchParams();
  params.set("id", id);
  if (since) params.set("since", since);
  if (limit) params.set("limit", String(limit));
  params.set("asc", asc ? "true" : "false");
  return fetchJson<MPUDataRaw[]>(`/mpu/history?${params.toString()}`);
}

// ---------- MÉTRICAS ----------
export type MinuteAggRow = {
  minute: string;
  t_open_ms_avg: number | null;
  t_close_ms_avg: number | null;
  t_cycle_ms_avg: number | null;
  runtime_s: number;
  cpm: number;
  vib_avg?: number | null;
};

export async function getMinuteAgg(
  act: "A1" | "A2",
  since = "-60m"
): Promise<MinuteAggRow[]> {
  const params = new URLSearchParams();
  params.set("act", act);
  if (since) params.set("since", since);
  return fetchJson<MinuteAggRow[]>(`/metrics/minute-agg?${params.toString()}`);
}

// Nova função para retornar CPM de atuador
export async function getCpmByActuator(act: "A1" | "A2", since = "-60m"): Promise<number> {
  const params = new URLSearchParams();
  params.set("act", act);
  if (since) params.set("since", since);
  const data = await fetchJson<MinuteAggRow[]>(`/metrics/minute-agg?${params.toString()}`);
  const cpm = data.reduce((acc, row) => acc + (row.cpm || 0), 0);
  return cpm; // Retorna o total de CPM
}

// --- Monitoring-only endpoints ---
export async function getRuntime(): Promise<{ runtime_seconds: number; since: string | null }> {
  const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/live/runtime`);
  if (!res.ok) throw new Error(`runtime: ${res.status}`);
  return res.json();
}

type TimingRow = {
  ts_utc: string | null;
  dt_abre_s: number | null;
  dt_fecha_s: number | null;
  dt_ciclo_s: number | null;
};
export type ActuatorTimings = { actuator_id: number; last: TimingRow };

export async function getActuatorTimings(): Promise<{ actuators: ActuatorTimings[] }> {
  const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/live/actuators/timings`);
  if (!res.ok) throw new Error(`timings: ${res.status}`);
  return res.json();
}
