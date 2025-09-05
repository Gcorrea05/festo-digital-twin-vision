// src/lib/api.ts
// ---------------------------------------------
// Base da API
const raw = (import.meta.env.VITE_API_BASE ?? "").trim();
export const API_BASE =
  /^https?:\/\//i.test(raw) && raw
    ? raw.replace(/\/+$/, "")
    : `http://${window.location.hostname}:8000`;

console.log("API_BASE =", API_BASE);

// ---------------------------------------------
// Função auxiliar para GET JSON
async function jget<T = any>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

// ---------------------------------------------
// Endpoints de histórico OPC e MPU
export function getOPCHistory(
  name: string,
  since: string = "-1d",        // -60s, -15m, -1h, -1d, ou ISO8601
  limit: number = 20000
) {
  const params = new URLSearchParams({
    name,
    since,
    asc: "true",
    limit: String(limit),
  });
  return jget<{ items: any[] }>(`${API_BASE}/opc/history?${params.toString()}`);
}

export function getMPUHistory(
  id: "MPUA1" | "MPUA2" = "MPUA1",
  limit: number = 20000
) {
  const params = new URLSearchParams({
    id,
    asc: "true",
    limit: String(limit),
  });
  return jget<{ items: any[] }>(`${API_BASE}/mpu/history?${params.toString()}`);
}

// ---------------------------------------------
// Helpers matemáticos
export function rms(values: number[]) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const mse = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return Math.sqrt(mse);
}

export function stateOf(
  recuado: number,
  avancado: number
): "aberto" | "fechado" | "erro" | "indef" {
  if (recuado === 1 && avancado === 0) return "fechado";
  if (avancado === 1 && recuado === 0) return "aberto";
  if (avancado === 1 && recuado === 1) return "erro";
  return "indef";
}

export function computeCPM(
  inicia: { ts_utc: string; value_bool: any }[],
  para: { ts_utc: string; value_bool: any }[]
) {
  if (!inicia.length || !para.length) return 0;
  const rises = (arr: any[]) => {
    const out: number[] = [];
    let prev = 0;
    for (const s of arr) {
      const v = Number(!!s.value_bool);
      if (v === 1 && prev === 0) out.push(Date.parse(s.ts_utc));
      prev = v;
    }
    return out;
  };
  const rI = rises(inicia);
  const rP = rises(para);
  const pairs = Math.min(rI.length, rP.length);
  if (pairs === 0) return 0;

  const firstTs = Math.min(rI[0] ?? Infinity, rP[0] ?? Infinity);
  const lastTs = Math.max(rI.at(-1) ?? -Infinity, rP.at(-1) ?? -Infinity);
  const spanSec = Math.max(1, (lastTs - firstTs) / 1000);

  const cycles = pairs;
  return (cycles * 60) / spanSec; // ciclos por minuto
}
