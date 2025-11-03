import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Ctx = {
  /** Atuador selecionado globalmente (1 = A1 / Modelo 1, 2 = A2 / Modelo 2) */
  selectedId: 1 | 2;
  /** Define o atuador selecionado globalmente */
  setSelectedId: (id: 1 | 2) => void;
  /** Alterna entre 1 e 2 (opcional) */
  toggle: () => void;
};

const ActSelCtx = createContext<Ctx | undefined>(undefined);

const LS_KEY = "actuator_selected_id";

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
export function ActuatorSelectionProvider({ children }: { children: ReactNode }) {
  // estado inicial: tenta URL (?act=1|2) -> localStorage -> 1
  const getInitial = (): 1 | 2 => {
    try {
      const usp = new URLSearchParams(window.location.search);
      const fromUrl = usp.get("act");
      if (fromUrl === "1" || fromUrl === "2") return Number(fromUrl) as 1 | 2;
    } catch {}
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw === "1" || raw === "2") return Number(raw) as 1 | 2;
    } catch {}
    return 1;
  };

  const [selectedId, setSelectedIdState] = useState<1 | 2>(getInitial);

  // persiste no localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, String(selectedId));
    } catch {}
  }, [selectedId]);

  // setter com validação
  const setSelectedId = (id: 1 | 2) => {
    setSelectedIdState(id === 2 ? 2 : 1);
  };

  const toggle = () => setSelectedIdState((prev) => (prev === 1 ? 2 : 1));

  const value = useMemo(
    () => ({ selectedId, setSelectedId, toggle }),
    [selectedId]
  );

  return <ActSelCtx.Provider value={value}>{children}</ActSelCtx.Provider>;
}
