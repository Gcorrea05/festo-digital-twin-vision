// src/hooks/useActuatorsLive.ts
import { useEffect, useRef, useState } from "react";
import { getActuatorsStateFast } from "@/lib/api";

/** Shape do payload que o backend devolve em /api/live/snapshot (compat) */
export type ActuatorLiveItem = {
  /** Pode vir como id ou actuator_id dependendo da rota; normalizamos em publish() */
  id?: 1 | 2 | number;
  actuator_id?: 1 | 2 | number;
  state: string;                 // "RECUADO" | "AVANÇADO" | ...
  pending: string | null;        // "AV" | "REC" | null
  fault?: string | null;         // opcional no backend
  elapsed_ms?: number;           // opcional (debug)
  started_at?: string | null;    // ISO ou null
};

export type LiveState = {
  ts: string;
  actuators: ActuatorLiveItem[];
} | null;

const REFRESH_MS = 1500; // 1500–3000 ms costuma ser um bom compromisso

// ---------- Singleton global para compartilhar polling entre componentes ----------
let globalCache: LiveState = null;
let globalListeners = new Set<(s: LiveState) => void>();
let globalTimer: number | null = null;
let fetching = false;

/** Compara dois estados e só notifica se houver mudança relevante */
function publish(next: LiveState) {
  // 1) Se nunca tivemos cache, publica direto
  if (!globalCache || !next) {
    globalCache = next;
    globalListeners.forEach((fn) => fn(globalCache));
    return;
  }

  // 2) Comparação superficial de ts
  const prevTs = globalCache.ts;
  const nextTs = next.ts;
  if (prevTs !== nextTs) {
    globalCache = next;
    globalListeners.forEach((fn) => fn(globalCache));
    return;
  }

  // 3) Normalização leve: id sempre presente
  const prevActs = globalCache.actuators ?? [];
  const nextActs = next.actuators ?? [];

  if (prevActs.length !== nextActs.length) {
    globalCache = next;
    globalListeners.forEach((fn) => fn(globalCache));
    return;
  }

  // 4) Comparação elemento a elemento (com guards para undefined)
  let sameActs = true;
  for (let i = 0; i < nextActs.length; i++) {
    const a = prevActs[i] ?? null; // <-- evita 'possibly undefined'
    const b = nextActs[i] ?? null; // <-- evita 'possibly undefined'
    if (!a || !b) {
      sameActs = false;
      break;
    }

    const aId = (a.id ?? a.actuator_id) as number | undefined;
    const bId = (b.id ?? b.actuator_id) as number | undefined;

    if (
      aId !== bId ||
      (a.state ?? "") !== (b.state ?? "") ||
      (a.pending ?? null) !== (b.pending ?? null) ||
      (a.fault ?? null) !== (b.fault ?? null) ||
      (a.elapsed_ms ?? -1) !== (b.elapsed_ms ?? -1) ||
      (a.started_at ?? null) !== (b.started_at ?? null)
    ) {
      sameActs = false;
      break;
    }
  }

  if (!sameActs) {
    globalCache = next;
    globalListeners.forEach((fn) => fn(globalCache));
  }
}

async function tickOnce() {
  if (fetching) return;
  fetching = true;
  try {
    // getActuatorsStateFast() deve retornar algo no shape { ts, actuators }
    const data = await getActuatorsStateFast();
    // Segurança: garante que os itens tenham sempre a chave "id"
    const normalized: LiveState =
      data && Array.isArray(data.actuators)
        ? {
            ts: String(data.ts ?? new Date().toISOString()),
            actuators: data.actuators.map((it: any) => ({
              id: (it?.id ?? it?.actuator_id) as number,
              actuator_id: (it?.actuator_id ?? it?.id) as number,
              state: String(it?.state ?? ""),
              pending: (it?.pending ?? null) as string | null,
              fault: (it?.fault ?? null) as string | null,
              elapsed_ms: typeof it?.elapsed_ms === "number" ? it.elapsed_ms : undefined,
              started_at: (it?.started_at ?? null) as string | null,
            })),
          }
        : null;

    publish(normalized);
  } catch {
    // silencioso – manteremos o último bom estado
  } finally {
    fetching = false;
  }
}

function startGlobalLoop() {
  if (globalTimer != null) return;

  const loop = async () => {
    // pausa quando a aba estiver oculta (economiza CPU/Rede)
    if (typeof document !== "undefined" && document.hidden) return;
    await tickOnce();
  };

  // dispara já uma vez
  void loop();

  // agenda o polling
  globalTimer = window.setInterval(loop, REFRESH_MS);
}

function stopGlobalLoopIfUnused() {
  if (globalListeners.size === 0 && globalTimer != null) {
    window.clearInterval(globalTimer);
    globalTimer = null;
  }
}

// ---------- Hook público ----------
export function useActuatorsLive() {
  const [state, setState] = useState<LiveState>(globalCache);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    // listener local com dedupe barato para evitar re-renders inúteis
    const listener = (s: LiveState) => {
      if (!mountedRef.current) return;
      setState((prev) => {
        // caso base: se não temos prev, aceita
        if (!prev || !s) return s;

        // ts diferente? aceita
        if (prev.ts !== s.ts) return s;

        const pa = prev.actuators ?? [];
        const na = s.actuators ?? [];
        if (pa.length !== na.length) return s;

        for (let i = 0; i < pa.length; i++) {
          const a = pa[i] ?? null; // <-- evita 'possibly undefined'
          const b = na[i] ?? null; // <-- evita 'possibly undefined'
          if (!a || !b) return s;

          const aId = (a.id ?? a.actuator_id) as number | undefined;
          const bId = (b.id ?? b.actuator_id) as number | undefined;

          if (
            aId !== bId ||
            (a.state ?? "") !== (b.state ?? "") ||
            (a.pending ?? null) !== (b.pending ?? null) ||
            (a.fault ?? null) !== (b.fault ?? null) ||
            (a.elapsed_ms ?? -1) !== (b.elapsed_ms ?? -1) ||
            (a.started_at ?? null) !== (b.started_at ?? null)
          ) {
            return s;
          }
        }
        // nada mudou
        return prev;
      });
    };

    globalListeners.add(listener);
    startGlobalLoop();

    // visibilidade da página: quando volta a ficar visível, força um tick
    const onVis = () => {
      if (!document.hidden) void tickOnce();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVis);
      globalListeners.delete(listener);
      stopGlobalLoopIfUnused();
    };
  }, []);

  return state;
}
