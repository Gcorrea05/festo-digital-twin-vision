// src/lib/api.ts
// Cliente REST alinhado aos endpoints existentes:
//
// - Health:   GET /health
// - OPC:      GET /opc/latest?name=..., GET /opc/history?name=... (&since,&limit,&asc)
// - Actuators:GET /api/live/actuators/state
// - MPU:      GET /mpu/ids, GET /mpu/latest?id=MPUA1, GET /mpu/history?id=MPUA1
//
// Obs: getSystem() mantém compat com usos antigos (mapeia /health → {mode,severity,ts})

export type OPCFacet = "S1" | "S2" | "V_AVANCO" | "V_RECUO" | "INICIA" | "PARA";

export type ActuatorLiveItem = {
  actuator_id: string; // "AT1"
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
  id: string; // "MPUA1"
  ax?: number; ay?: number; az?: number;
  ax_g?: number; ay_g?: number; az_g?: number;
  gx?: number; gy?: number; gz?: number;
  gx_dps?: number; gy_dps?: number; gz_dps?: number;
  temp_c?: number;
};

// --------------------------------------------------
// infra
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

// --------------------------------------------------
// Health / System
export async function getHealth(): Promise<any> {
  return fetchJson("/health");
}

export async function getSystem(): Promise<any> {
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

// --------------------------------------------------
// Actuators (estado lógico)
export async function getLiveActuatorsState(): Promise<ActuatorsLiveResponse> {
  return fetchJson("/api/live/actuators/state");
}

// --------------------------------------------------
// OPC
/**
 * Constrói o name para /opc/*:
 *  - S1 → "Recuado_{id}S1"
 *  - S2 → "Avancado_{id}S2"
 *  - demais: literal
 */
function composeOpcName(actuatorId: number, facet: OPCFacet): string {
  if (facet === "S1") return `Recuado_${actuatorId}S1`;
  if (facet === "S2") return `Avancado_${actuatorId}S2`;
  return facet;
}

function normalizeOpcHistItem(rec: any): { ts: string; value: number } {
  const ts = (rec?.ts_utc ?? rec?.ts) as string;
  let v: number;
  if (rec?.value_bool !== undefined) v = rec.value_bool ? 1 : 0;
  else if (rec?.value !== undefined) v = Number(rec.value);
  else if (rec?.value_num !== undefined) v = Number(rec.value_num);
  else v = 0;
  return { ts, value: v };
}

/**
 * Retorna os últimos valores (0/1) para facets de um atuador.
 * Usa /opc/latest?name=...
 */
export async function getOPCLatest(
  actuatorId: number,
  facets: OPCFacet[] = ["S1", "S2"]
): Promise<Record<OPCFacet, 0 | 1>> {
  const out: Partial<Record<OPCFacet, 0 | 1>> = {};
  await Promise.all(
    facets.map(async (f) => {
      const name = composeOpcName(actuatorId, f);
      const item = await fetchJson<any>(`/opc/latest?name=${encodeURIComponent(name)}`);
      const v = item?.value_bool !== undefined
        ? (item.value_bool ? 1 : 0)
        : Number(item?.value ?? 0);
      out[f] = v ? 1 : 0;
    })
  );
  return out as Record<OPCFacet, 0 | 1>;
}

/**
 * Histórico normalizado {ts, value} para um facet de um atuador.
 * Usa /opc/history?name=...&since=...&limit=...&asc=true|false
 */
export async function getOPCHistory(opts: {
  actuatorId: number;
  facet: OPCFacet;
  since: string; // "-60m" | "-24h" | ISO8601
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
  const rows = await fetchJson<any[]>(`/opc/history?${params.toString()}`);
  return rows.map(normalizeOpcHistItem);
}
// --------------------------------------------------
// MPU
export async function getMpuIds(): Promise<string[]> {
  return fetchJson<string[]>("/mpu/ids");
}

/**
 * Última leitura de um MPU específico.
 * GET /mpu/latest?id=MPUA1
 */
export async function getLatestMPU(id: string): Promise<MPUDataRaw> {
  const params = new URLSearchParams();
  params.set("id", id);
  return fetchJson<MPUDataRaw>(`/mpu/latest?${params.toString()}`);
}

/**
 * Histórico de leituras do MPU.
 * GET /mpu/history?id=MPUA1&since=-5m&limit=1000&asc=true
 */
export async function getMPUHistory(opts: {
  id: string;
  since?: string; // "-5m" etc.
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
