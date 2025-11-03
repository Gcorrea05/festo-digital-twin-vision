// src/hooks/useActuators.ts
import { useEffect, useRef, useState } from "react";
import { getLiveActuatorsState, getOPCHistory, type OPCHistoryRow } from "@/lib/api";

export type ActuatorItem = {
  id: number;
  recuado: 0 | 1;
  avancado: 0 | 1;
  ts: string;
  cpm: number;
  fsm?: {
    state: "aberto" | "fechado" | "abrindo" | "fechando" | "erro" | "indef";
    error_code?: string | number;
  };
};

type HookState = {
  data: ActuatorItem[];
  loading: boolean;
  error: string | null;
};

// conversor robusto para 0/1 (value pode ser string | number | boolean | null | undefined)
function toBool01(v: OPCHistoryRow["value"]): 0 | 1 {
  if (v === true || v === "true" || v === "True" || v === "TRUE") return 1;
  if (v === false || v === "false" || v === "False" || v === "FALSE") return 0;
  if (v === 1 || v === "1") return 1;
  if (v === 0 || v === "0") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? (n > 0 ? 1 : 0) : 0;
}

async function getCpmLastMinute(actuatorId: number): Promise<number> {
  try {
    const hist = await getOPCHistory({
      actuatorId,
      facet: "S2", // borda de subida de S2 = transição para ABERTO
      since: "-60s",
      asc: true,
    });

    let c = 0;
    for (let i = 1; i < hist.length; i++) {
      const prevRow = hist[i - 1] as OPCHistoryRow | undefined;
      const currRow = hist[i] as OPCHistoryRow | undefined;
      if (!prevRow || !currRow) continue;

      const prev = toBool01(prevRow.value);
      const curr = toBool01(currRow.value);
      if (prev === 0 && curr === 1) c++;
    }
    return c; // janela de 60s → “ciclos por minuto” ≈ contagem de bordas
  } catch {
    return 0;
  }
}

// mapeia {state,pending,fault} do backend → fsm + facets (recuado/avancado)
function deriveFromLive(a: any): { fsm: ActuatorItem["fsm"]; recuado: 0 | 1; avancado: 0 | 1 } {
  const st = String(a?.state ?? "").toUpperCase(); // "RECUADO" | "AVANÇADO" | ...
  const pend = (a?.pending ?? null) as "AV" | "REC" | null;
  const fault = String(a?.fault ?? "NONE").toUpperCase();

  if (fault.includes("CONFLICT")) {
    return { fsm: { state: "erro" }, recuado: 1, avancado: 1 };
  }

  // transições guiadas por 'pending'
  if (pend === "AV") {
    if (!st.includes("AVAN")) return { fsm: { state: "abrindo" }, recuado: 0, avancado: 0 };
    return { fsm: { state: "aberto" }, recuado: 0, avancado: 1 };
  }
  if (pend === "REC") {
    if (!st.includes("RECU")) return { fsm: { state: "fechando" }, recuado: 0, avancado: 0 };
    return { fsm: { state: "fechado" }, recuado: 1, avancado: 0 };
  }

  // estável pelo 'state'
  if (st.includes("AVAN")) return { fsm: { state: "aberto" }, recuado: 0, avancado: 1 };
  if (st.includes("RECU")) return { fsm: { state: "fechado" }, recuado: 1, avancado: 0 };

  // legado (flags)
  const to01 = (v: any) => ((v === true || v === 1) ? 1 : 0) as 0 | 1;
  const rec = to01(a?.recuado);
  const av = to01(a?.avancado);
  if (rec === 1 && av === 0) return { fsm: { state: "fechado" }, recuado: 1, avancado: 0 };
  if (av === 1 && rec === 0) return { fsm: { state: "aberto" }, recuado: 0, avancado: 1 };
  if (av === 1 && rec === 1) return { fsm: { state: "erro" }, recuado: 1, avancado: 1 };
  return { fsm: { state: "indef" }, recuado: 0, avancado: 0 };
}

export function useActuators(ids: number[] = [1, 2], intervalMs = 250) {
  const [state, setState] = useState<HookState>({
    data: [],
    loading: true,
    error: null,
  });
  const timerRef = useRef<number | null>(null);

  // cache leve de CPM (evita recalcular a cada tick curto)
  const cpmCacheRef = useRef<Map<number, { ts: number; value: number }>>(new Map());

  async function computeCpmWithRateLimit(id: number, minIntervalMs = 2000): Promise<number> {
    const now = Date.now();
    const cached = cpmCacheRef.current.get(id);
    if (cached && now - cached.ts < minIntervalMs) return cached.value;
    const v = await getCpmLastMinute(id);
    cpmCacheRef.current.set(id, { ts: now, value: v });
    return v;
  }

  async function load() {
    try {
      setState((s) => ({ ...s, loading: true, error: null }));

      const live = await getLiveActuatorsState(); // { ts, system, actuators: [...] }

      // normaliza e filtra pelos IDs solicitados
      const itemsRaw = (live?.actuators ?? []).map((a: any) => {
        const idNum = Number(a?.id ?? a?.actuator_id ?? 0);
        const { fsm, recuado, avancado } = deriveFromLive(a);
        return {
          id: idNum,
          recuado,
          avancado,
          ts: String(a?.ts ?? a?.ts_utc ?? live?.ts ?? new Date().toISOString()),
          fsm,
        };
      });

      const filtered = itemsRaw.filter((it: any) => ids.includes(it.id));

      // CPM por atuador solicitado (rate-limited)
      const cpmEntries = await Promise.all(
        filtered.map(async (it) => [it.id, await computeCpmWithRateLimit(it.id)] as const)
      );
      const cpmMap = new Map<number, number>(cpmEntries);

      const data: ActuatorItem[] = filtered.map((it) => ({
        id: it.id,
        recuado: it.recuado,
        avancado: it.avancado,
        ts: it.ts,
        fsm: it.fsm,
        cpm: cpmMap.get(it.id) ?? 0,
      }));

      setState({ data, loading: false, error: null });
    } catch (e: any) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e?.message ?? "Erro ao carregar atuadores",
      }));
    }
  }

  useEffect(() => {
    load();
    if (intervalMs > 0) {
      timerRef.current = window.setInterval(load, intervalMs) as unknown as number;
    }
    return () => {
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current as unknown as number);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ids), intervalMs]); // repolla se ids/intervalo mudarem

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    refresh: load,
  };
}
