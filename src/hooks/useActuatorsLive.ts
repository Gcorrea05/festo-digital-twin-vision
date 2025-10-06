// src/hooks/useActuatorsLive.ts
import { useEffect, useRef, useState } from "react";
import { getActuatorsStateFastAbortable } from "@/lib/api";

type LiveState = {
  ts: string;
  actuators: { actuator_id: 1|2; state: string; pending: string|null; fault: string; elapsed_ms: number; started_at: string|null }[];
} | null;

const REFRESH_MS = 1500; // ajuste aqui: 1500–3000ms costuma ser bom

// Singleton simples para compartilhar dado entre componentes
let globalCache: LiveState = null;
let globalListeners = new Set<(s: LiveState) => void>();
let globalTimer: number | null = null;
let inFlight: AbortController | null = null;

function startGlobalLoop() {
  if (globalTimer != null) return;

  const tick = async () => {
    // pausa se aba não visível
    if (typeof document !== "undefined" && document.hidden) return;

    // garante 1 requisição por vez
    try {
      if (inFlight) inFlight.abort();
      inFlight = new AbortController();
      const data = await getActuatorsStateFastAbortable(inFlight.signal).catch(() => null as LiveState);
      if (data) {
        globalCache = data;
        globalListeners.forEach(fn => fn(globalCache));
      }
    } catch {
      // ignore network abort/err
    } finally {
      inFlight = null;
    }
  };

  // first run
  void tick();
  globalTimer = window.setInterval(tick, REFRESH_MS);
}

function stopGlobalLoopIfUnused() {
  if (globalListeners.size === 0 && globalTimer != null) {
    window.clearInterval(globalTimer);
    globalTimer = null;
    if (inFlight) { inFlight.abort(); inFlight = null; }
  }
}

export function useActuatorsLive() {
  const [state, setState] = useState<LiveState>(globalCache);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const listener = (s: LiveState) => { if (mountedRef.current) setState(s); };
    globalListeners.add(listener);
    startGlobalLoop();

    // visibilidade da página
    const vis = () => {
      // quando volta a ficar visível, força um tick imediato
      if (!document.hidden && globalTimer != null) {
        // força update já no próximo loop
      }
    };
    document.addEventListener("visibilitychange", vis);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", vis);
      globalListeners.delete(listener);
      stopGlobalLoopIfUnused();
    };
  }, []);

  return state;
}
