// src/lib/api.ts
// Funções REST de fallback para quando o WS não estiver disponível.
// Todas usam o mesmo API_BASE definido em VITE_API_BASE ou fallback localhost.

export type OPCFacet =
  | "S1"
  | "S2"
  | "V_AVANCO"
  | "V_RECUO"
  | "INICIA"
  | "PARA";

export type ActuatorState = {
  id: number;
  fsm: { state: string; error_code?: string | number };
  facets: Record<OPCFacet, 0 | 1>;
  cpm: number;
  rms: number;
  ts: string;
};

export type MPUData = {
  id: string;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  temp_c: number;
  ts: string;
};

function getApiBase(): string {
  const env = import.meta.env?.VITE_API_BASE as string | undefined;
  if (env && /^https?:\/\//i.test(env)) return env.replace(/\/+$/, "");
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

async function fetchJson<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText} on ${url}`);
  }
  return (await res.json()) as T;
}

// --- Health & System ---

export async function getHealth(): Promise<any> {
  return fetchJson("/api/health");
}

export async function getSystem(): Promise<any> {
  return fetchJson("/api/system");
}

// --- Actuators ---

export async function getActuatorStatus(id: number): Promise<ActuatorState> {
  return fetchJson(`/api/actuators/${id}/status`);
}

export async function getActuatorCPM(
  id: number,
  window_s: number = 60
): Promise<{ cpm: number }> {
  return fetchJson(`/api/actuators/${id}/cpm?window_s=${window_s}`);
}

// --- OPC ---

export async function getOPCLatest(
  actuatorId: number,
  facets: OPCFacet[] = ["S1", "S2", "V_AVANCO", "V_RECUO", "INICIA", "PARA"]
): Promise<Record<OPCFacet, 0 | 1>> {
  const q = encodeURIComponent(facets.join(","));
  return fetchJson(
    `/api/opc/latest?actuator_id=${actuatorId}&facets=${q}`
  );
}

export async function getOPCHistory(opts: {
  actuatorId: number;
  facet: OPCFacet;
  since: string;
  limit?: number;
  asc?: boolean;
}): Promise<Array<{ ts: string; value: number }>> {
  const { actuatorId, facet, since, limit = 1000, asc = false } = opts;
  const params = new URLSearchParams();
  params.set("actuator_id", actuatorId.toString());
  params.set("facet", facet);
  params.set("since", since);
  if (limit) params.set("limit", limit.toString());
  if (asc) params.set("asc", "true");
  return fetchJson(`/api/opc/history?${params.toString()}`);
}

// --- MPU ---

export async function getLatestMPU(
  id: number
): Promise<MPUData> {
  return fetchJson(`/api/mpu/latest?mpu_id=${id}`);
}

export async function getMPUHistory(opts: {
  mpuId: number;
  since: string;
  limit?: number;
  asc?: boolean;
}): Promise<Array<MPUData>> {
  const { mpuId, since, limit = 1000, asc = false } = opts;
  const params = new URLSearchParams();
  params.set("mpu_id", mpuId.toString());
  params.set("since", since);
  if (limit) params.set("limit", limit.toString());
  if (asc) params.set("asc", "true");
  return fetchJson(`/api/mpu/history?${params.toString()}`);
}

export async function getMPURms(
  mpuId: number,
  window_s: number = 2
): Promise<{ rms: number }> {
  return fetchJson(`/api/mpu/rms?mpu_id=${mpuId}&window_s=${window_s}`);
}
