// src/lib/api.ts  (1/8)

// Base da API
export const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE || "http://localhost:8000";

export function getApiBase() {
  return API_BASE;
}

export type AlertItem = {
  id: string | number;
  message: string;
  severity: "info" | "warning" | "critical";
  timestamp: string; // ISO
};
// Flags
const MPU_DISABLED =
  String((import.meta as any)?.env?.VITE_DISABLE_MPU ?? "").toLowerCase() ===
  "true";

const USE_MPU_LATEST =
  String((import.meta as any)?.env?.VITE_USE_MPU_LATEST ?? "")
    .toLowerCase() === "true";

// Disponibilidade de rotas de MPU
let mpuAvailability: "unknown" | "present" | "absent" = MPU_DISABLED
  ? "absent"
  : "unknown";

// Fetch helper
export async function fetchJson<T = any>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    const msg = `API ${res.status} ${res.statusText} on ${url}`;
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

// Tenta N caminhos
async function tryFetchJson<T = any>(paths: string[]): Promise<T | null> {
  for (const p of paths) {
    try {
      const data = await fetchJson<T>(p);
      return data;
    } catch {
      // segue
    }
  }
  return null;
}

// Helpers de normalização
function toArrayPayload(x: any): any[] {
  if (Array.isArray(x)) return x;
  if (x && typeof x === "object") {
    for (const k of ["rows", "data", "items", "history", "results", "records"]) {
      if (Array.isArray((x as any)[k])) return (x as any)[k];
    }
  }
  return [];
}

function pickNum(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
// src/lib/api.ts  (2/8)

// ==== OPC helpers (robustos) ====

// Gera candidatos de "since"/durations aceitos por backends comuns
function sinceCandidatesFor(seconds: number): {
  scalar: string[]; // para since/last/seconds/window/duration/period
  fromIso: string[]; // para from/start (ISO passado)
} {
  const now = Date.now();
  const iso = new Date(now - seconds * 1000).toISOString();

  // formatos escalares (evita "-1m"): "-60", "-60s", "60", "60s"
  const scalar = [`-${seconds}`, `-${seconds}s`, `${seconds}`, `${seconds}s`];

  // timestamps relativos (from = agora - N)
  const fromIso = [iso];

  return { scalar, fromIso };
}

// Converte string since para segundos aproximados (aceita "-300s", "-10m", ISO)
function parseSinceToSeconds(since: string): number | null {
  if (!since) return null;
  const s = since.trim();

  // "-300" | "-300s" | "300" | "300s"
  const m1 = s.match(/^-?(\d+)\s*s?$/i);
  if (m1) {
    const num = Number(m1[1]);
    return Number.isFinite(num) ? num : null;
  }

  // "-10m" | "10m"
  const m2 = s.match(/^-?(\d+)\s*m$/i);
  if (m2) {
    const min = Number(m2[1]);
    return Number.isFinite(min) ? min * 60 : null;
  }

  // ISO → segundos no passado
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const diff = Math.round((Date.now() - t) / 1000);
    return diff > 0 ? diff : null;
  }

  return null;
}

export type OPCHistoryRow = { ts: string; value: number | boolean };

function normalizeOpcRows(payload: any): OPCHistoryRow[] {
  const arr = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? (payload.rows ||
          payload.data ||
          payload.items ||
          payload.history ||
          payload.results ||
          payload.records ||
          [])
      : [];

  return arr
    .map((r: any) => {
      const ts =
        r.ts ??
        r.ts_utc ??
        r.timestamp ??
        r.time ??
        r.created_at ??
        r.date ??
        null;

      const v =
        r.value ??
        r.value_bool ??
        r.v ??
        r.state ??
        r.val ??
        r.bool ??
        r.number ??
        null;

      if (!ts) return null;
      return { ts: String(ts), value: v as any };
    })
    .filter(Boolean) as OPCHistoryRow[];
}

// Cache de caminho “que funcionou” por (act, facet)
const opcPathCache = new Map<string, string>();
// src/lib/api.ts  (3/8)

// Monta um leque de caminhos/parametrizações “amplas” e compatíveis
function buildOpcHistoryPathsWide(
  actuatorId: number,
  facet: "S1" | "S2",
  seconds: number,
  useAsc: boolean
): string[] {
  const base = "/opc/history";

  const { scalar, fromIso } = sinceCandidatesFor(seconds);

  // Variações de act (numérico e "A1"/"A2")
  const actVariants = [String(actuatorId), actuatorId === 1 ? "A1" : "A2"];

  // Variações de facet
  const facetVariants = [facet, facet.toLowerCase() as "S1" | "S2"];

  // possíveis chaves de duração/intervalo
  const durationKeys = ["since", "last", "seconds", "window", "duration", "period"];

  const qs = (obj: Record<string, string>) =>
    "?" + new URLSearchParams(obj).toString();

  const urls: string[] = [];

  for (const act of actVariants) {
    for (const f of facetVariants) {
      // 1) Somente parâmetros básicos (act/facet + uma duration key)
      for (const k of durationKeys) {
        for (const val of scalar) {
          const params: Record<string, string> = { act, facet: f, [k]: val };
          if (useAsc) params["asc"] = "1";
          urls.push(`${base}${qs(params)}`);
        }
      }

      // 2) “from” baseado em ISO (sem “to”)
      for (const from of fromIso) {
        const params: Record<string, string> = { act, facet: f, from };
        if (useAsc) params["asc"] = "1";
        urls.push(`${base}${qs(params)}`);
      }

      // 3) Variante “name” (ex.: Avancado_1S2 / Recuado_1S1)
      const name =
        f.toUpperCase() === "S1" ? `Recuado_${act}S1` : `Avancado_${act}S2`;

      for (const k of durationKeys) {
        for (const val of scalar) {
          const params: Record<string, string> = { name, [k]: val };
          if (useAsc) params["asc"] = "1";
          urls.push(`${base}${qs(params)}`);
        }
      }

      for (const from of fromIso) {
        const params: Record<string, string> = { name, from };
        if (useAsc) params["asc"] = "1";
        urls.push(`${base}${qs(params)}`);
      }

      // 4) Algumas variações com segmentos (comuns em APIs)
      for (const val of scalar) {
        const p1 = `${base}/${encodeURIComponent(act)}/${encodeURIComponent(
          f
        )}${qs({ since: val, ...(useAsc ? { asc: "1" } : {}) })}`;
        urls.push(p1);
      }

      for (const from of fromIso) {
        const p2 = `${base}/${encodeURIComponent(act)}/${encodeURIComponent(
          f
        )}${qs({ from, ...(useAsc ? { asc: "1" } : {}) })}`;
        urls.push(p2);
      }
    }
  }

  return urls;
}

// Versão MUITO robusta: tenta cache → larga variações amplas até achar uma
async function getOPCHistorySafe(args: {
  actuatorId: number;
  facet: "S1" | "S2";
  windowSeconds: number;
  sortAsc?: boolean;
}): Promise<OPCHistoryRow[]> {
  const key = `${args.actuatorId}:${args.facet}`;
  const asc = !!args.sortAsc;

  // 0) tenta o caminho cacheado primeiro
  const cached = opcPathCache.get(key);
  if (cached) {
    try {
      const rows = normalizeOpcRows(await fetchJson<any>(cached));
      if (rows.length) return rows;
    } catch {
      // se falhar, limpa cache e cai no amplo
      opcPathCache.delete(key);
    }
  }

  // 1) tenta amplo (sem cache)
  const paths = buildOpcHistoryPathsWide(
    args.actuatorId,
    args.facet,
    args.windowSeconds,
    asc
  );

  for (const p of paths) {
    try {
      const rows = normalizeOpcRows(await fetchJson<any>(p));
      if (rows.length) {
        // cacheia o primeiro que funcionou para chamadas futuras
        opcPathCache.set(key, p);
        return rows;
      }
    } catch {
      // tenta próximo
    }
  }

  // 2) nada deu: retorna vazio
  return [];
}
// src/lib/api.ts  (4/8)

/* =========================================
 *  OPC HISTORY (assinatura antiga com fallback)
 * ========================================= */

export async function getOPCHistory(params: {
  actuatorId: number; // 1|2
  facet: "S1" | "S2";
  since: string; // "-600" | "-600s" | "-10m" | ISO
  asc?: boolean;
}): Promise<OPCHistoryRow[]> {
  // 1) Tenta direitos básicos (padrão do backend) primeiro
  try {
    const qs1 = new URLSearchParams({
      act: String(params.actuatorId),
      facet: params.facet,
      since: params.since,
      ...(params.asc ? { asc: "1" } : {}),
    });
    const direct = await fetchJson<any>(`/opc/history?${qs1.toString()}`);
    const rows = normalizeOpcRows(direct);
    if (rows.length) return rows;
  } catch {
    // segue pro safe
  }

  // 2) Fallback seguro: converte since → seg e tenta variações estritas
  const seconds = parseSinceToSeconds(params.since) ?? 600; // padrão 10 min
  return await getOPCHistorySafe({
    actuatorId: params.actuatorId,
    facet: params.facet,
    windowSeconds: seconds,
    sortAsc: params.asc,
  });
}

/* =========================
 *  OPC por name (mantido p/ compat direta)
 * ========================= */

export type OPCHistoryByNameRow = {
  ts_utc?: string;
  ts?: string;
  value_bool: number | boolean | null;
};

export async function getOpcHistoryByName(params: {
  name: string; // "Avancado_1S2"
  since?: string; // "-600" | "-600s" | ...
  asc?: boolean;
  limit?: number; // ignorado pelo backend, mas mantido na assinatura
  offset?: number; // idem
}): Promise<OPCHistoryByNameRow[]> {
  const qs = new URLSearchParams({
    name: params.name,
    ...(params.since ? { since: params.since } : {}),
    ...(params.asc ? { asc: "1" } : {}),
  });
  return fetchJson<OPCHistoryByNameRow[]>(`/opc/history?${qs.toString()}`);
}
// src/lib/api.ts  (5/8)

/* =========================
 *  Aggregations (Analytics)
 * ========================= */

export type MinuteAgg = {
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
  since: string
): Promise<MinuteAgg[]> {
  const qs = new URLSearchParams({ act, since });
  return fetchJson<MinuteAgg[]>(`/metrics/minute-agg?${qs.toString()}`);
}

/* =========================
 *  Health + helpers
 * ========================= */

export type HealthResp =
  | { status: "ok" | "degraded" | "offline"; [k: string]: any }
  | null;

export async function getHealth(): Promise<HealthResp> {
  const r = await tryFetchJson<HealthResp>(["/health", "/api/health"]);
  return r ?? { status: "offline" };
}

export async function getAlerts(): Promise<AlertItem[]> {
  // tenta caminhos comuns, seguindo a estratégia robusta do arquivo
  const raw =
    (await tryFetchJson<any>([
      "/alerts",
      "/api/alerts",
      "/events/alerts",
      "/api/events/alerts",
    ])) ?? [];

  // normalização defensiva
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw?.items)
    ? raw.items
    : [];

  return arr.map((x: any, i: number) => ({
    id: x?.id ?? i,
    message: String(x?.message ?? x?.msg ?? "alert"),
    severity: ((): "info" | "warning" | "critical" => {
      const s = String(x?.severity ?? x?.level ?? "info").toLowerCase();
      if (s === "critical" || s === "crit" || s === "error") return "critical";
      if (s === "warning" || s === "warn") return "warning";
      return "info";
    })(),
    timestamp: String(
      x?.timestamp ?? x?.ts ?? x?.ts_utc ?? x?.created_at ?? new Date().toISOString()
    ),
  }));
}


export function opcName(actuatorId: number, facet: "S1" | "S2") {
  return facet === "S1"
    ? `Recuado_${actuatorId}S1`
    : `Avancado_${actuatorId}S2`;
}

/* ==================================================
 *  "Último valor" de OPC via HISTÓRICO (estrito)
 * ================================================== */

export async function getOpcLatestViaHistory(
  actuatorId: 1 | 2,
  facet: "S1" | "S2"
): Promise<{ value: boolean | null; ts: string | null }> {
  // tenta 10 min (600s), depois 20 min (1200s)
  for (const w of [600, 1200]) {
    try {
      const rows = await getOPCHistorySafe({
        actuatorId,
        facet,
        windowSeconds: w,
        sortAsc: true,
      });
      if (rows && rows.length) {
        const last = rows[rows.length - 1];
        const v =
          typeof last.value === "boolean"
            ? last.value
            : Number(last.value) === 1
              ? true
              : Number(last.value) === 0
                ? false
                : null;
        return { value: v, ts: (last as any).ts ?? null };
      }
    } catch {
      // segue
    }
  }
  return { value: null, ts: null };
}

// Compat: manter o export antigo usado pelo LiveMetrics
export async function getOpcLatestByActuatorFacet(
  actuatorId: 1 | 2,
  facet: "S1" | "S2"
): Promise<{ ts_utc: string | null; name: string; value_bool: boolean | null } | null> {
  const r = await getOpcLatestViaHistory(actuatorId, facet);
  const name = opcName(actuatorId, facet);
  if (!r) return null;
  return { ts_utc: r.ts, name, value_bool: r.value };
}
// src/lib/api.ts  (6/8)

/* =========================
 *  MPU HISTORY (robusto) + “latest” via histórico
 * ========================= */

function buildMpuHistoryPaths(
  qid: string,
  nid: number,
  since: string,
  limit: number,
  asc: boolean
) {
  // aceita undefined, filtra antes de criar a querystring
  const qs = (params: Record<string, string | number | undefined>) =>
    "?" +
    new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v as string | number)])
    ).toString();

  const baseParams: Record<string, string | number> = {
    since,
    limit,
    asc: asc ? 1 : 0,
  };

  const qp = [
    { id: qid },
    { id: nid },
    { mpu: qid },
    { mpu: nid },
    { device: qid },
    { device: nid },
    { name: qid },
  ].map((p) => qs({ ...baseParams, ...p }));

  const pp = [
    `/mpu/${encodeURIComponent(qid)}/history${qs(baseParams)}`,
    `/api/mpu/${encodeURIComponent(qid)}/history${qs(baseParams)}`,
    `/mpu/${nid}/history${qs(baseParams)}`,
    `/api/mpu/${nid}/history${qs(baseParams)}`,
  ];

  return [
    `/mpu/history${qp[0]}`,
    `/api/mpu/history${qp[0]}`,
    `/mpu/history${qp[1]}`,
    `/api/mpu/history${qp[1]}`,
    `/mpu/history${qp[2]}`,
    `/api/mpu/history${qp[2]}`,
    `/mpu/history${qp[3]}`,
    `/api/mpu/history${qp[3]}`,
    `/mpu/history${qp[4]}`,
    `/api/mpu/history${qp[4]}`,
    `/mpu/history${qp[5]}`,
    `/api/mpu/history${qp[5]}`,
    `/mpu/history${qp[6]}`,
    `/api/mpu/history${qp[6]}`,
    ...pp,
  ];
}

// Checa se existe pelo menos UMA rota de MPU disponível.
async function ensureMpuAvailability(): Promise<"present" | "absent"> {
  if (mpuAvailability !== "unknown") return mpuAvailability;
  if (MPU_DISABLED) {
    mpuAvailability = "absent";
    return mpuAvailability;
  }
  const paths = buildMpuHistoryPaths("MPUA1", 1, "-1m", 1, true);
  const r = await tryFetchJson<any>(paths);
  mpuAvailability = r ? "present" : "absent";
  return mpuAvailability;
}

export type MpuHistoryRow = {
  ts_utc: string;
  ts?: string;
  ax_g: number | null;
  ay_g: number | null;
  az_g: number | null;
  ax?: number | null;
  ay?: number | null;
  az?: number | null;
};

function idVariants(id: number | "MPUA1" | "MPUA2") {
  const qid = typeof id === "number" ? (id === 1 ? "MPUA1" : "MPUA2") : id;
  const nid = typeof id === "number" ? id : qid === "MPUA1" ? 1 : 2;
  return { qid, nid };
}
// src/lib/api.ts  (7/8)

export async function getMPUHistory(
  id: number | "MPUA1" | "MPUA2",
  since: string,
  limit = 1000,
  asc = true
): Promise<MpuHistoryRow[]> {
  if ((await ensureMpuAvailability()) === "absent") return [];
  const { qid, nid } = idVariants(id);
  const paths = buildMpuHistoryPaths(qid, nid, since, limit, asc);
  const raw = await tryFetchJson<any>(paths);
  const arr = toArrayPayload(raw);
  if (!arr.length) return [];
  return arr.map((r: any) => {
    const ts_utc = String(
      r.ts_utc ?? r.ts ?? r.timestamp ?? r.time ?? r.created_at ?? new Date().toISOString()
    );
    const axg = pickNum(r.ax_g ?? r.ax ?? r.x ?? r.accel_x);
    const ayg = pickNum(r.ay_g ?? r.ay ?? r.y ?? r.accel_y);
    const azg = pickNum(r.az_g ?? r.az ?? r.z ?? r.accel_z);
    return {
      ts_utc,
      ts: r.ts ?? ts_utc,
      ax_g: axg,
      ay_g: ayg,
      az_g: azg,
      ax: axg,
      ay: ayg,
      az: azg,
    };
  });
}

// Alias
export const getMpuHistory = getMPUHistory;

export type MpuLatestRow = {
  ts_utc: string;
  mpu_id: number;
  ax_g: number | null;
  ay_g: number | null;
  az_g: number | null;
  gx_dps?: number | null;
  gy_dps?: number | null;
  gz_dps?: number | null;
};

function normMpuRow(r: any): MpuLatestRow | null {
  if (!r) return null;
  const ts_utc = String(r.ts_utc ?? r.ts ?? new Date().toISOString());
  const axg = r.ax_g ?? r.ax;
  const ayg = r.ay_g ?? r.ay;
  const azg = r.az_g ?? r.az;
  return {
    ts_utc,
    mpu_id: Number(r.mpu_id ?? r.id ?? 0),
    ax_g: pickNum(axg),
    ay_g: pickNum(ayg),
    az_g: pickNum(azg),
    gx_dps: r.gx_dps ?? null,
    gy_dps: r.gy_dps ?? null,
    gz_dps: r.gz_dps ?? null,
  };
}

async function getMpuLatestViaHistory(
  id: number | "MPUA1" | "MPUA2"
): Promise<MpuLatestRow | null> {
  for (const since of ["-10m", "-60m"]) {
    const rows = await getMPUHistory(id, since, 1000, true);
    if (rows.length > 0) {
      const last = rows[rows.length - 1];
      return {
        ts_utc: String(last.ts_utc ?? last.ts),
        mpu_id: typeof id === "number" ? id : id === "MPUA1" ? 1 : 2,
        ax_g: last.ax_g,
        ay_g: last.ay_g,
        az_g: last.az_g,
      };
    }
  }
  return null;
}
// src/lib/api.ts  (8/8)

export async function getMpuLatest(
  id: number | "MPUA1" | "MPUA2"
): Promise<MpuLatestRow | null> {
  if ((await ensureMpuAvailability()) === "absent") return null;
  if (!USE_MPU_LATEST) {
    return await getMpuLatestViaHistory(id);
  }
  const { qid, nid } = idVariants(id);
  const raw =
    (await tryFetchJson<any>([
      `/mpu/latest?id=${qid}`,
      `/api/mpu/latest?id=${qid}`,
      `/mpu/last?id=${qid}`,
      `/api/mpu/last?id=${qid}`,
      `/mpu/latest?id=${nid}`,
      `/api/mpu/latest?id=${nid}`,
      `/mpu/last?id=${nid}`,
      `/api/mpu/last?id=${nid}`,
      `/mpu/latest/${qid}`,
      `/api/mpu/latest/${qid}`,
      `/mpu/latest/${nid}`,
      `/api/mpu/latest/${nid}`,
    ])) ?? null;
  if (raw) return normMpuRow(raw);
  return await getMpuLatestViaHistory(id);
}

export type MpuLatestCompat = {
  ts_utc: string;
  id: "MPUA1" | "MPUA2" | number;
  ax: number;
  ay: number;
  az: number;
  ax_g?: number | null;
  ay_g?: number | null;
  az_g?: number | null;
};

export async function getLatestMPU(
  id: number | "MPUA1" | "MPUA2"
): Promise<MpuLatestCompat | null> {
  const row = await getMpuLatest(id);
  if (!row) return null;
  return {
    ts_utc: row.ts_utc,
    id: typeof id === "number" ? id : id,
    ax: Number(row.ax_g ?? 0),
    ay: Number(row.ay_g ?? 0),
    az: Number(row.az_g ?? 0),
    ax_g: row.ax_g,
    ay_g: row.ay_g,
    az_g: row.az_g,
  };
}

/* =========================
 *  IDs de MPUs
 * ========================= */

function normalizeMpuIds(payload: any): Array<string | number> {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    if (payload.length && typeof payload[0] === "object") {
      return payload
        .map((x) => x?.id ?? x?.name ?? x?.mpu_id)
        .filter((v) => v != null);
    }
    return payload;
  }
  if (Array.isArray(payload?.ids)) return payload.ids;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export async function getMpuIds(): Promise<Array<string | number>> {
  if ((await ensureMpuAvailability()) === "absent") return [];
  const r = await tryFetchJson<any>([
    "/mpu/ids",
    "/api/mpu/ids",
    "/mpu/list",
    "/api/mpu/list",
    "/mpu",
    "/api/mpu",
  ]);
  const ids = normalizeMpuIds(r);
  return ids;
}

/* ==================================================
 *  CPM via histórico S2 (usa versão segura)
 * ================================================== */
export async function getActuatorCpmFromHistory(
  actuatorId: 1 | 2,
  windowSeconds = 60
): Promise<number> {
  try {
    const rows = await getOPCHistorySafe({
      actuatorId,
      facet: "S2",
      windowSeconds,
      sortAsc: true,
    });
    if (!rows || rows.length < 2) return 0;
    let edges = 0;
    for (let i = 1; i < rows.length; i++) {
      const prev = Number((rows[i - 1].value as any));
      const curr = Number((rows[i].value as any));
      if (prev === 0 && curr === 1) edges++;
    }
    return edges;
  } catch {
    return 0;
  }
}

/* ==================================================
 *  Snapshot para LiveContext
 * ================================================== */
export type LiveSnapshot = {
  ts: string;
  system: { status: string };
  actuators: Array<{
    id: 1 | 2;
    facets: { S1: boolean | null; S2: boolean | null };
    cpm?: number | null;
  }>;
};

export async function getLiveActuatorsState(): Promise<LiveSnapshot> {
  const [health, a1s1, a1s2, a2s1, a2s2, cpm1, cpm2] = await Promise.all([
    getHealth(),
    getOpcLatestViaHistory(1, "S1"),
    getOpcLatestViaHistory(1, "S2"),
    getOpcLatestViaHistory(2, "S1"),
    getOpcLatestViaHistory(2, "S2"),
    getActuatorCpmFromHistory(1, 60),
    getActuatorCpmFromHistory(2, 60),
  ]);

  return {
    ts: new Date().toISOString(),
    system: { status: (health?.status ?? "offline").toString() },
    actuators: [
      { id: 1, facets: { S1: a1s1.value, S2: a1s2.value }, cpm: cpm1 ?? null },
      { id: 2, facets: { S1: a2s1.value, S2: a2s2.value }, cpm: cpm2 ?? null },
    ],
  };
}
export async function getSystemStatus(): Promise<{
  components: {
    actuators?: string; sensors?: string; transmission?: string; control?: string;
  };
}> {
const data = await (async () => {
    try { return await fetchJson<any>("/api/system/status"); } catch {}
    try { return await fetchJson<any>("/system/status"); } catch {}
    return { components: {} };
  })();
  return data ?? { components: {} };
}