// src/hooks/useActuators.ts
import { useEffect, useRef, useState } from "react";
import { getLiveActuatorsState, getOPCHistory } from "@/lib/api";

export type ActuatorItem = {
  id: number;
  recuado: 0 | 1;
  avancado: 0 | 1;
  ts: string;
  cpm: number;
  fsm?: { state: string; error_code?: string | number };
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
      facet: "S2",
      since: "-60s",
      asc: true,
      limit: 2000,
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

export function useActuators(ids: number[] = [1, 2], intervalMs = 2000) {
  const [state, setState] = useState<HookState>({
    data: [],
    loading: true,
    error: null,
  });
  const timerRef = useRef<number | null>(null);

  async function load() {
    try {
      setState((s) => ({ ...s, loading: true, error: null }));
      const live = await getLiveActuatorsState(); // { actuators: [...] }

      // Normaliza lista vinda do backend e filtra pelos IDs solicitados
      const itemsRaw = (live?.actuators ?? []).map((a: any) => {
        const m = String(a.actuator_id || "").match(/(\d+)/);
        const idNum = m ? parseInt(m[1], 10) : 0;
        return {
          id: idNum,
          recuado: (a.recuado ?? 0) as 0 | 1,
          avancado: (a.avancado ?? 0) as 0 | 1,
          ts: String(a.ts ?? new Date().toISOString()),
          fsm: { state: String(a.state ?? "") },
        };
      });

      const filtered = itemsRaw.filter((it: any) => ids.includes(it.id));

      // CPM por atuador solicitado
      const cpmMap = new Map<number, number>();
      await Promise.all(
        filtered.map(async (it) => {
          const cpm = await getCpmLastMinute(it.id);
          cpmMap.set(it.id, cpm);
        })
      );

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
  }, ids); // recarrega se o conjunto de IDs mudar

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    refresh: load,
  };
}
