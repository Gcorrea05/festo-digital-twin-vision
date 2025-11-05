import { useEffect, useMemo, useRef, useState } from "react";
import { openSlowWS, type WSMessageMinuteAgg } from "@/lib/api";

type Row = import("@/lib/api").MinuteAggRow;

type Store = {
  mapA1: Map<string, Row>;
  mapA2: Map<string, Row>;
  lastWsAt: number | null;
};

const MAX_MINUTES = 120;

function pruneMap(m: Map<string, Row>) {
  // mantém só os últimos MAX_MINUTES por ordem de minute
  const arr = Array.from(m.values()).sort((a, b) => a.minute.localeCompare(b.minute));
  if (arr.length <= MAX_MINUTES) return;
  const drop = arr.length - MAX_MINUTES;
  for (let i = 0; i < drop; i++) m.delete(arr[i].minute);
}

export function useMinuteAgg() {
  const storeRef = useRef<Store>({ mapA1: new Map(), mapA2: new Map(), lastWsAt: null });
  const [, force] = useState(0);

  // abre o WS /ws/slow e captura "minute-agg"
  useEffect(() => {
    const close = openSlowWS({
      onMessage: (msg: any) => {
        if (!msg || msg.type !== "minute-agg") return;
        const m = msg as WSMessageMinuteAgg;
        const s = storeRef.current;
        for (const it of m.items) {
          const target = it.actuator === "A1" ? s.mapA1 : s.mapA2;
          target.set(it.row.minute, it.row);
          pruneMap(target);
        }
        s.lastWsAt = Date.now();
        force(x => x + 1);
      },
    });
    return () => { try { close?.(); } catch {} };
  }, []);

  const getRows = (act: "A1" | "A2"): Row[] => {
    const m = act === "A1" ? storeRef.current.mapA1 : storeRef.current.mapA2;
    return Array.from(m.values()).sort((a, b) => a.minute.localeCompare(b.minute));
  };

  const hydrateIfStale = async (fetcher: (act: "A1" | "A2") => Promise<Row[]>) => {
    const s = storeRef.current;
    const stale = !s.lastWsAt || (Date.now() - s.lastWsAt) > 90_000;
    if (!stale) return;
    const [a1, a2] = await Promise.all([fetcher("A1"), fetcher("A2")]);
    s.mapA1.clear(); s.mapA2.clear();
    for (const r of a1) s.mapA1.set(r.minute, r);
    for (const r of a2) s.mapA2.set(r.minute, r);
    pruneMap(s.mapA1); pruneMap(s.mapA2);
    force(x => x + 1);
  };

  return {
    getRows,
    lastWsAt: storeRef.current.lastWsAt,
    hydrateIfStale,
    clear: () => { storeRef.current.mapA1.clear(); storeRef.current.mapA2.clear(); force(x => x + 1); },
  };
}
