// src/context/SimulationContext.tsx
import React, { createContext, useContext, useMemo, useState } from "react";
import type { SimulationScenario } from "@/lib/api";

type SimCtx = {
  /** cenário ativo aplicado (ou null) */
  active: SimulationScenario | null;
  /** flags visuais (client-side) */
  flags: { stopSystem: boolean; createAlert: boolean };
  /** define/atualiza flags (ex.: toggles do front) */
  setFlags: (f: Partial<SimCtx["flags"]>) => void;
  /** aplica um cenário na UI (client-side only) */
  apply: (scn: SimulationScenario, flags?: Partial<SimCtx["flags"]>) => void;
  /** encerra simulação e limpa efeitos visuais */
  end: () => void;
  /** se a UI deve exibir parada simulada */
  isStopped: boolean;
};

const Ctx = createContext<SimCtx | null>(null);

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<SimulationScenario | null>(null);
  const [flags, setFlagsState] = useState<{ stopSystem: boolean; createAlert: boolean }>({
    stopSystem: true,
    createAlert: true,
  });
  const setFlags = (f: Partial<SimCtx["flags"]>) =>
    setFlagsState((prev) => ({ ...prev, ...f }));

  const apply = (scn: SimulationScenario, f?: Partial<SimCtx["flags"]>) => {
    if (f) setFlags(f);
    setActive(scn);
  };
  const end = () => setActive(null);

  const isStopped = useMemo(() => {
    if (!active) return false;
    const mustStop = Number(active?.error?.stop_required ?? 0) === 1;
    return mustStop || !!flags.stopSystem;
  }, [active, flags.stopSystem]);

  const value: SimCtx = { active, flags, setFlags, apply, end, isStopped };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSimulation() {
  const v = useContext(Ctx);
  // fallback seguro quando o Provider não estiver montado
  if (!v) {
    return {
      active: null,
      flags: { stopSystem: false, createAlert: false },
      setFlags: (_: Partial<SimCtx["flags"]>) => {},
      apply: (_scn: SimulationScenario) => {},
      end: () => {},
      isStopped: false,
    } as SimCtx;
  }
  return v;
}
