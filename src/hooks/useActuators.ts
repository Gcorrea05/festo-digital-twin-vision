// src/hooks/useActuators.ts
import { useEffect, useRef, useState } from "react";
import { getLiveActuatorsState, getOPCHistory } from "@/lib/api";

export type ActuatorItem = {
  id: number;
  recuado: 0 | 1;
  avancado: 0 | 1;
  ts: string;
  cpm: number;
  fsm?: { state: "aberto" | "fechado" | "abrindo" | "fechando" | "erro" | "indef"; error_code?: string | number };
};

type HookState = {
  data: ActuatorItem[];
  loading: boolean;
  error: string | null;
};

async function getCpmLastMinute(actuatorId: number): Promise<number> {
  try {
    const hist = await getOPCHistory({
      actuatorId,
      facet: "S2",      // subida de S2 = transição para ABERTO
      since: "-60s",
      asc: true,
    });
    let c = 0;
    for (let i = 1; i < hist.length; i++) {
      const prev = Number(hist[i - 1].value);
      const curr = Number(hist[i].value);
      if (prev === 0 && curr === 1) c++;
    }
    return c;
  } catch {
    return 0;
  }
}

// mapeia {state,pending,fault} do backend → fsm + facets (recuado/avancado)
function deriveFromLive(a: any): { fsm: ActuatorItem["fsm"]; recuado: 0|1; avancado: 0|1 } {
  const st = String(a?.state ?? "").toUpperCase();       // "RECUADO" | "AVANÇADO"
  const pend = (a?.pending ?? null) as ("AV" | "REC" | null);
  const fault = String(a?.fault ?? "NONE").toUpperCase();

  if (fault.includes("CONFLICT")) {
    return { fsm: { state: "erro" }, recuado: 1, avancado: 1 };
  }

  // transições: enquanto "pending" não chegou no estado final, mostre abrindo/fechando
  if (pend === "AV") {
    if (!st.includes("AVAN")) return { fsm: { state: "abrindo" }, recuado: 0, avancado: 0 };
    return { fsm: { state: "aberto" }, recuado: 0, avancado: 1 };
  }
  if (pend === "REC") {
    if (!st.includes("RECU")) return { fsm: { state: "fechando" }, recuado: 0, avancado: 0 };
    return { fsm: { state: "fechado" }, recuado: 1, avancado: 0 };
  }

  // estável
  if (st.includes("AVAN")) return { fsm: { state: "aberto" }, recuado: 0, avancado: 1 };
  if (st.includes("RECU")) return { fsm: { state: "fechado" }, recuado: 1, avancado: 0 };

  // legado (se vierem flags)
  const to01 = (v: any) => (v === true || v === 1 ? 1 : 0) as 0|1;
  const rec = to01(a?.recuado);
  const av  = to01(a?.avancado);
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

  // cache leve de CPM para não recalcular a cada tick curtinho
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
      const live = await getLiveActuatorsState(); // { actuators: [...] }

      // normaliza e filtra pelos IDs solicitados
      const itemsRaw = (live?.actuators ?? []).map((a: any) => {
        const idNum = Number(a?.id ?? a?.actuator_id ?? 0);
        const { fsm, recuado, avancado } = deriveFromLive(a);
        return {
          id: idNum,
          recuado,
          avancado,
          ts: String(a.ts ?? a.ts_utc ?? live?.ts ?? new Date().toISOString()),
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
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ids), intervalMs]); // refaz polling se ids ou intervalo mudarem

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    refresh: load,
  };
}
