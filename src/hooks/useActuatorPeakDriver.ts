// src/hooks/useActuatorPeakDriver.ts
import { useEffect, useRef } from "react";
import { useLive, type StableState } from "@/context/LiveContext";

/**
 * API mínima esperada do driver de animação do seu componente visual.
 * - playUp():   anima de ABERTO(AVANÇADO) até o PICO(RECUADO)
 * - playDown(): anima do PICO(RECUADO) de volta para ABERTO(AVANÇADO)
 * - setAtPeak(): opcional, força o estado visual de pico (sem animar)
 */
export type PeakDriver = {
  playUp: () => void;
  playDown: () => void;
  setAtPeak?: (v: boolean) => void;
};

type InitOrState = "INIT" | StableState;

/**
 * Conecta o estado do /ws/live à sua animação de pico.
 * Regras:
 * - Visual inicia em ABERTO (equivale a AVANÇADO) e parado.
 * - Quando estado mudar para RECUADO -> dispara playUp() (sobe para o pico).
 * - Quando estado voltar para AVANÇADO -> dispara playDown() (desce do pico).
 * - Não reproduz passado: se a 1ª leitura já vier RECUADO, apenas marca "atPeak".
 */
export function useActuatorPeakDriver(
  actuatorId: 1 | 2,
  anim: PeakDriver
) {
  const { snapshot } = useLive();
  const prevStateRef = useRef<InitOrState>("INIT");
  const atPeakRef = useRef(false);

  useEffect(() => {
    const act = snapshot?.actuators?.find((a) => a.id === actuatorId);
    if (!act) return;

    const curr = act.state as StableState;
    const prev = prevStateRef.current;

    // 1ª passada: assume visual aberto (AVANÇADO), sem animar
    if (prev === "INIT") {
      prevStateRef.current = curr;
      const alreadyAtPeak = curr === "RECUADO";
      atPeakRef.current = alreadyAtPeak;
      anim.setAtPeak?.(alreadyAtPeak); // só posiciona; sem animação
      return;
    }

    if (curr === prev) return; // sem mudança

    // AVANÇADO -> RECUADO: começo do pico
    if (prev !== "RECUADO" && curr === "RECUADO") {
      if (!atPeakRef.current) {
        anim.playUp();
        atPeakRef.current = true;
        anim.setAtPeak?.(true);
      }
    }

    // RECUADO -> AVANÇADO: fim do pico
    if (prev === "RECUADO" && curr === "AVANÇADO") {
      if (atPeakRef.current) {
        anim.playDown();
        atPeakRef.current = false;
        anim.setAtPeak?.(false);
      }
    }

    prevStateRef.current = curr;
  }, [snapshot, actuatorId, anim]);
}
