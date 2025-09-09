// src/context/ActuatorSelectionContext.tsx
// Contexto simples para compartilhar o atuador selecionado (1 ou 2)
// ThreeDModel seta, LiveMetrics lê.

import React, { createContext, useContext, useState, ReactNode } from "react";

type Ctx = {
  selectedId: number;              // 1 | 2
  setSelectedId: (id: number) => void;
};

const ActuatorSelectionContext = createContext<Ctx | undefined>(undefined);

export function useActuatorSelection(): Ctx {
  const ctx = useContext(ActuatorSelectionContext);
  if (!ctx) {
    // Fallback seguro: se não houver provider, assume 1
    return { selectedId: 1, setSelectedId: () => {} };
  }
  return ctx;
}

export function ActuatorSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<number>(1);
  return (
    <ActuatorSelectionContext.Provider value={{ selectedId, setSelectedId }}>
      {children}
    </ActuatorSelectionContext.Provider>
  );
}
