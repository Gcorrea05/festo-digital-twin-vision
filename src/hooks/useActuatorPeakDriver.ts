// src/hooks/useActuatorPeakDriver.ts
import { useEffect, useRef } from "react";
import { useLive } from "@/context/LiveContext";

// === Tipos locais (espelham o LiveContext) ===
type StableStateLocal = "RECUADO" | "AVANÇADO" | "DESCONHECIDO";

/**
 * API mínima esperada do driver de animação.
 */
export type PeakDriver = {
  playUp: () => void;
  playDown: () => void;
  setAtPeak?: (v: boolean) => void;
};

type InitOrState = "INIT" | StableStateLocal;

/**
 * Conecta o estado do /ws/live à animação de pico do atuador.
 */
export function useActuatorPeakDriver(actuatorId: 1 | 2, anim: PeakDriver) {
  const { snapshot } = useLive();

  // estados internos estáveis
  const prevStateRef = useRef<InitOrState>("INIT");
  const atPeakRef = useRef(false);

  // evita recriação de deps por objeto anim novo a cada render
  const animRef = useRef(anim);
  useEffect(() => {
    animRef.current = anim;
  }, [anim]);

  useEffect(() => {
    const act = snapshot?.actuators?.find((a) => a.id === actuatorId);
    const curr = act?.state as StableStateLocal | undefined;
    if (!curr) return; // ainda sem estado

    const prev = prevStateRef.current;

    // boot: posiciona sem animar
    if (prev === "INIT") {
      prevStateRef.current = curr;
      const alreadyAtPeak = curr === "RECUADO";
      atPeakRef.current = alreadyAtPeak;
      animRef.current.setAtPeak?.(alreadyAtPeak);
      return;
    }

    if (curr === prev) return; // sem mudança real

    // AVANÇADO -> RECUADO: subir para pico
    if (prev !== "RECUADO" && curr === "RECUADO") {
      if (!atPeakRef.current) {
        try { animRef.current.playUp(); } catch {}
        atPeakRef.current = true;
        animRef.current.setAtPeak?.(true);
      }
    }

    // RECUADO -> AVANÇADO: descer do pico
    if (prev === "RECUADO" && curr === "AVANÇADO") {
      if (atPeakRef.current) {
        try { animRef.current.playDown(); } catch {}
        atPeakRef.current = false;
        animRef.current.setAtPeak?.(false);
      }
    }

    prevStateRef.current = curr;
  }, [snapshot, actuatorId]);
}
