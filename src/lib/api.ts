// src/lib/api.ts

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

// ======================
// Tipos (somente os usados)
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

export type CyclesRateResp = {
  window_seconds: number;
  pairs_count: number;
  cycles: number;
  cycles_per_second: number; // CPM = cycles_per_second * 60
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
      ts_utc: string | null;   // ISO
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

export type HealthResp = { status: string; db_time?: string | null } | null;

// ======================
// Dashboard (Live / etc.)
// ======================

// Estados dos atuadores (live) — consulta curta e frequente
export async function getActuatorsState(): Promise<LatchedResp> {
  const bust = Date.now();
  return fetchJson<LatchedResp>(`/api/live/actuators/state?since_ms=8000&_=${bust}`);
}
export const getLatchedActuators = getActuatorsState;

// Ciclos totais — ~1s
export async function getCyclesTotal(): Promise<CyclesTotalResp> {
  return fetchJson<CyclesTotalResp>(`/api/live/cycles/total`);
}

// ======================
// Monitoring
// ======================

export async function getCyclesRate60s(windowS: number = 60): Promise<CyclesRateResp> {
  return fetchJson<CyclesRateResp>(`/api/live/cycles/rate?window_s=${windowS}`);
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

// Seu backend atual NÃO expõe /api/system/status; mantemos a função por compat.
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
      return { status: "offline", db_time: null };
    }
  }
}

// ======================
// Analytics (compat com Analytics.tsx)
// ======================
export type OPCHistoryRow = { ts: string; value: number | boolean };

export async function getOPCHistory(params: {
  actuatorId: number;        // 1|2
  facet: "S1" | "S2";        // S1=Recuado, S2=Avançado
  since: string;             // "-60m", "-600s", ISO...
  asc?: boolean;             // default: false
}): Promise<OPCHistoryRow[]> {
  const qs = new URLSearchParams({
    act: String(params.actuatorId),
    facet: params.facet,
    since: params.since,
    ...(params.asc ? { asc: "1" } : {}),
  });

  try {
    const raw = await fetchJson<any>(`/opc/history?${qs.toString()}`);
    const arr = Array.isArray(raw)
      ? raw
      : raw?.items || raw?.data || raw?.rows || raw?.history || raw?.results || raw?.records || [];
    return (arr as any[]).map((r) => ({
      ts: String(r.ts ?? r.ts_utc ?? r.timestamp ?? r.time ?? r.created_at ?? r.date ?? new Date().toISOString()),
      value: (r.value ?? r.value_bool ?? r.v ?? r.state ?? r.val ?? r.bool ?? r.number ?? 0) as any,
    }));
  } catch {
    const name = params.facet === "S1" ? `Recuado_${params.actuatorId}S1` : `Avancado_${params.actuatorId}S2`;
    return getOPCHistoryByName(name, params.since, !!params.asc, 20000);
  }
}

// compat por name direto (useOpcStream etc.)
export async function getOPCHistoryByName(
  name: string,
  since: string = "-10m",
  asc: boolean = true,
  limit: number = 20000
): Promise<OPCHistoryRow[]> {
  const qs = new URLSearchParams({ name, since, limit: String(limit), ...(asc ? { asc: "1" } : {}) });
  let raw: any;
  try {
    raw = await fetchJson<any>(`/opc/history?${qs.toString()}`);
  } catch {
    try {
      raw = await fetchJson<any>(`/api/opc/history?${qs.toString()}`);
    } catch {
      return [];
    }
  }
  const arr = Array.isArray(raw)
    ? raw
    : raw?.items || raw?.data || raw?.rows || raw?.history || raw?.results || raw?.records || [];
  return (arr as any[]).map((r) => ({
    ts: String(r.ts ?? r.ts_utc ?? r.time ?? r.timestamp ?? new Date().toISOString()),
    value: (r.value ?? r.value_bool ?? r.v ?? r.bool ?? r.state ?? 0) as any,
  }));
}
export const getOpcHistoryByName = getOPCHistoryByName;

// Agregação por minuto (se não houver endpoint, retorna vazio)
export type MinuteAgg = {
  minute: string;
  t_open_ms_avg: number | null;
  t_close_ms_avg: number | null;
  t_cycle_ms_avg: number | null;
  runtime_s: number;
  cpm: number;
  vib_avg?: number | null;
};

export async function getMinuteAgg(act: "A1" | "A2", since: string): Promise<MinuteAgg[]> {
  const qs = new URLSearchParams({ act, since });
  try {
    return await fetchJson<MinuteAgg[]>(`/metrics/minute-agg?${qs.toString()}`);
  } catch {
    try {
      return await fetchJson<MinuteAgg[]>(`/api/metrics/minute-agg?${qs.toString()}`);
    } catch {
      return [];
    }
  }
}

// ======================
// LiveContext helpers (system + actuators + mpu)
// ======================
export async function getLiveActuatorsState(): Promise<{
  ts: string;
  system: { status: string };
  actuators: any[];
}> {
  try {
    // endpoint válido nos seus logs
    const data = await fetchJson<any>("/api/live/actuators/state");
    const status = String(data?.system?.status ?? "unknown");
    return {
      ts: String(data?.ts ?? new Date().toISOString()),
      system: { status },
      actuators: Array.isArray(data?.actuators) ? data.actuators : [],
    };
  } catch {
    // fallback: health + tentativa de pegar "state"
    try {
      const raw = await getActuatorsState();
      const h = await getHealth().catch(() => ({ status: "offline" } as any));
      return {
        ts: new Date().toISOString(),
        system: { status: String((h as any)?.status ?? "unknown") },
        actuators: Array.isArray((raw as any)?.actuators) ? (raw as any).actuators : [],
      };
    } catch {
      const h = await getHealth().catch(() => ({ status: "offline" } as any));
      return { ts: new Date().toISOString(), system: { status: String((h as any).status) }, actuators: [] };
    }
  }
}

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

// ---- MPU: último valor (via history limit=1) ----
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
  const qs = new URLSearchParams({ id: asStr, since: "-30m", limit: "1" }); // pega o mais recente
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

  const items: any[] =
    Array.isArray(raw?.items) ? raw.items :
    Array.isArray(raw) ? raw :
    Array.isArray(raw?.data) ? raw.data : [];

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
    ax, ay, az, gx, gy, gz,
    ax_g: r.ax_g ?? ax,
    ay_g: r.ay_g ?? ay,
    az_g: r.az_g ?? az,
    gx_dps: r.gx_dps ?? gx,
    gy_dps: r.gy_dps ?? gy,
    gz_dps: r.gz_dps ?? gz,
    temp_c: r.temp_c ?? null,
  };
}
export const getMpuLatest = getLatestMPU; // alias

// ==== MPU: histórico (hooks/telas antigas) ====
export type MpuHistoryRow = {
  ts: string;
  ax: number; ay: number; az: number;
  gx?: number; gy?: number; gz?: number;
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

  const items: any[] =
    Array.isArray(raw?.items) ? raw.items :
    Array.isArray(raw) ? raw :
    Array.isArray(raw?.data) ? raw.data : [];

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
