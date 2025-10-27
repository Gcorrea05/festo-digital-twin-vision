import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Ctx = {
  /** Atuador selecionado globalmente (1 = A1 / Modelo 1, 2 = A2 / Modelo 2) */
  selectedId: 1 | 2;
  /** Define o atuador selecionado globalmente */
  setSelectedId: (id: 1 | 2) => void;
};

const ActSelCtx = createContext<Ctx | undefined>(undefined);

/** Hook para consumir o seletor de atuador */
export function useActuatorSelection(): Ctx {
  const v = useContext(ActSelCtx);
  if (!v) {
    throw new Error(
      "useActuatorSelection must be used inside <ActuatorSelectionProvider>"
    );
  }
  return v;
}

/** Provider que mantém no estado qual atuador (1/2) está selecionado */
export function ActuatorSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<1 | 2>(1);
  const value = useMemo(() => ({ selectedId, setSelectedId }), [selectedId]);
  return <ActSelCtx.Provider value={value}>{children}</ActSelCtx.Provider>;
}
