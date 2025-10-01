// src/hooks/useLatchedDisplay.ts
import { useMemo, useRef } from "react";

/** rótulos que a UI exibe */
export type DisplayLabel = "ABERTO" | "RECUADO" | "ABRINDO" | "FECHANDO" | "ERRO" | "—";

type Facets01 = { S1: 0 | 1; S2: 0 | 1 };

const STABLE_CONFIRM_MS = 200; // precisa ficar estável isso de tempo para “trocar”
const TRANSITION_HOLD_MS = 600; // segura transição (0/0) sem cair para “—”

type Track = {
  prevStable?: Exclude<DisplayLabel, "ABRINDO" | "FECHANDO" | "ERRO" | "—">; // ABERTO|RECUADO
  candidate?: "ABERTO" | "RECUADO";
  candSince?: number;
  lastStableCommit?: number;
  lastSeenTs?: number;
};

/** deduz facets (S1/S2) a partir do objeto do atuador */
function deriveFacets(a: any): { facets: Facets01 | null; conflict: boolean } {
  if (a?.facets && typeof a.facets.S1 === "number" && typeof a.facets.S2 === "number") {
    const S1 = a.facets.S1 ? 1 : 0;
    const S2 = a.facets.S2 ? 1 : 0;
    return { facets: { S1, S2 }, conflict: S1 === 1 && S2 === 1 };
  }
  const st = String(a?.state ?? "").toUpperCase(); // RECUADO/AVANÇADO
  if (st.includes("RECU")) return { facets: { S1: 1, S2: 0 }, conflict: false };
  if (st.includes("AVAN")) return { facets: { S1: 0, S2: 1 }, conflict: false };
  return { facets: { S1: 0, S2: 0 }, conflict: false }; // transição
}

/** converte facets estáveis para rótulo estável; 0/0 -> null (transição) */
function stableFromFacets(f: Facets01 | null): "ABERTO" | "RECUADO" | null | "ERRO" {
  if (!f) return null;
  if (f.S1 === 1 && f.S2 === 0) return "RECUADO";
  if (f.S1 === 0 && f.S2 === 1) return "ABERTO";
  if (f.S1 === 1 && f.S2 === 1) return "ERRO";
  return null; // 0/0 transição
}

/**
 * Hook que aplica histerese/“memória” no estado exibido.
 * - Mantém último estável na transição (0/0)
 * - Só confirma troca após STABLE_CONFIRM_MS
 * - Mostra ABRINDO/FECHANDO se houver pending contrário ao estável atual
 */
export function useLatchedDisplay(actuator: any, id: number) {
  const tracksRef = useRef<Record<number, Track>>({});

  const { label, facets } = useMemo(() => {
    const now = Date.now();
    const tr = (tracksRef.current[id] ||= {});
    const pend = (actuator?.pending ?? null) as "AV" | "REC" | null;

    const { facets, conflict } = deriveFacets(actuator);
    const stFromFacets = stableFromFacets(facets);

    // conflito explícito: ERRO na hora
    if (stFromFacets === "ERRO" || String(actuator?.fault ?? "").toUpperCase().includes("CONFLICT")) {
      return { label: "ERRO" as const, facets };
    }

    // se temos estável novo, checar debounce
    if (stFromFacets === "ABERTO" || stFromFacets === "RECUADO") {
      if (tr.prevStable !== stFromFacets) {
        // nova candidatura
        if (tr.candidate !== stFromFacets) {
          tr.candidate = stFromFacets;
          tr.candSince = now;
        }
        // confirmou?
        if (tr.candSince && now - tr.candSince >= STABLE_CONFIRM_MS) {
          tr.prevStable = stFromFacets;
          tr.lastStableCommit = now;
          tr.candidate = undefined;
          tr.candSince = undefined;
        }
      } else {
        // igual ao atual -> limpa candidato
        tr.candidate = undefined;
        tr.candSince = undefined;
      }
    } else {
      // 0/0 (transição): segura último estável por um tempo
      if (tr.lastStableCommit && now - tr.lastStableCommit <= TRANSITION_HOLD_MS) {
        // mantém
      } else {
        // ainda assim, em 0/0 mostramos transição conforme pending, se houver
      }
    }

    // decide rótulo a exibir
    let label: DisplayLabel = tr.prevStable ?? "—";

    // se estamos em transição e há pending contrário ao estável, exibe abrindo/fechando
    if (stFromFacets === null || stFromFacets === undefined) {
      if (pend === "AV" && tr.prevStable !== "ABERTO") label = "ABRINDO";
      else if (pend === "REC" && tr.prevStable !== "RECUADO") label = "FECHANDO";
    }

    // fallback: se não temos nenhum estável ainda, tenta deduzir pelo state textual
    if (!tr.prevStable) {
      const st = String(actuator?.state ?? "").toUpperCase();
      if (st.includes("RECU")) tr.prevStable = "RECUADO";
      else if (st.includes("AVAN")) tr.prevStable = "ABERTO";
      label = tr.prevStable ?? "—";
    }

    tr.lastSeenTs = now;
    return { label, facets };
  }, [actuator, id]);

  return { label, facets };
}

export default useLatchedDisplay;
