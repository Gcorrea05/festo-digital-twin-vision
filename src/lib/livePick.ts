// src/lib/livePick.ts
export type AnyLive = any;

function normAscii(s?: string | null): "AVANCADO" | "RECUADO" | null {
  if (!s) return null;
  const x = s.replace("Ç", "C");
  if (x === "AVANCADO") return "AVANCADO";
  if (x === "RECUADO") return "RECUADO";
  return null;
}

/** Extrai o estado do atuador (1 ou 2) de qualquer payload (antigo ou novo). */
export function pickActuatorState(live: AnyLive, id: 1 | 2): "AVANCADO" | "RECUADO" | null {
  if (!live) return null;

  // --- formato legado: { actuators: [{id, state}, ...] }
  const arr = live.actuators as Array<any> | undefined;
  if (Array.isArray(arr) && arr.length) {
    const found =
      arr.find((a) => a?.id === id) ??
      arr.find((a) => a?.actuator_id === id) ??
      arr[id - 1];
    const s = normAscii(found?.state ?? null);
    if (s) return s;
  }

  // --- formato novo: { a1: {state_ascii/raw_state}, a2: {...} }
  const block = id === 1 ? live.a1 : live.a2;
  const sNew =
    normAscii(block?.state_ascii ?? null) ||
    normAscii(block?.state ?? null) ||
    normAscii(block?.raw_state ?? null);
  if (sNew) return sNew;

  return null;
}
