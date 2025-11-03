import React, { createContext, useContext, useMemo, useState } from "react";

/** ================= Backend types (alinhado ao api_ws.py) ================= */
export type SimulationScenario = {
  scenario_id: string;
  actuator: 1 | 2;
  error: {
    id: number;
    code: string;
    name: string;
    grp: string;        // ex.: "SISTEMA" | "MPU..."
    severity: number;   // 0..5
  };
  cause: string;
  actions: string[];
  params?: Record<string, any>;
  ui?: {
    halt_sim?: boolean; // parar sistema no front
    halt_3d?: boolean;  // pausar 3D
    show_popup?: boolean;
  };
  resume_allowed?: boolean;
};

/** URL base para chamadas HTTP (usa VITE_API_BASE se definido) */
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE?.replace(/\/+$/, "") ||
  "http://localhost:8000";

/** ================= Contexto ================= */
type Flags = { stopSystem: boolean; createAlert: boolean };

type SimCtx = {
  /** cenário ativo aplicado (ou null) */
  active: SimulationScenario | null;
  /** flags visuais (client-side) */
  flags: Flags;
  /** define/atualiza flags (ex.: toggles do front) */
  setFlags: (f: Partial<Flags>) => void;
  /** aplica um cenário já construído na UI (client-side only) */
  apply: (scn: SimulationScenario, flags?: Partial<Flags>) => void;
  /** encerra simulação e limpa efeitos visuais (mantém flags) */
  end: () => void;
  /** encerra simulação e reseta flags para defaults */
  reset: () => void;
  /** aplica cenário vindo do backend por código (POST /api/simulation/draw) */
  applyFromCode: (code: string, flags?: Partial<Flags>) => Promise<SimulationScenario>;
  /** se a UI deve exibir parada simulada */
  isStopped: boolean;
};

const Ctx = createContext<SimCtx | null>(null);

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<SimulationScenario | null>(null);
  const [flags, setFlagsState] = useState<Flags>({
    stopSystem: true,
    createAlert: true,
  });

  const setFlags = (f: Partial<Flags>) =>
    setFlagsState((prev) => ({ ...prev, ...f }));

  const apply = (scn: SimulationScenario, f?: Partial<Flags>) => {
    if (f) setFlags(f);
    setActive(scn);
  };

  const end = () => setActive(null);

  const reset = () => {
    setActive(null);
    setFlagsState({ stopSystem: true, createAlert: true });
  };

  const isStopped = useMemo(() => {
    if (!active) return false;
    const uiStop = Boolean(active.ui?.halt_sim);
    return uiStop || flags.stopSystem;
  }, [active, flags.stopSystem]);

  const applyFromCode = async (code: string, f?: Partial<Flags>) => {
    const res = await fetch(`${API_BASE}/api/simulation/draw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ mode: "by_code", code }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`simulation/draw HTTP ${res.status} ${text}`.trim());
    }
    const scn: SimulationScenario = await res.json();
    apply(scn, f);
    return scn;
  };

  const value: SimCtx = {
    active,
    flags,
    setFlags,
    apply,
    end,
    reset,
    applyFromCode,
    isStopped,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSimulation(): SimCtx {
  const v = useContext(Ctx);
  // fallback seguro quando o Provider não estiver montado
  if (!v) {
    return {
      active: null,
      flags: { stopSystem: false, createAlert: false },
      setFlags: (_: Partial<Flags>) => {},
      apply: (_scn: SimulationScenario) => {},
      end: () => {},
      reset: () => {},
      applyFromCode: async (_code: string) => {
        throw new Error("SimulationProvider não montado");
      },
      isStopped: false,
    } as SimCtx;
  }
  return v;
}
