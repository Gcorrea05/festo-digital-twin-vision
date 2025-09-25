// src/hooks/useOpcStream.ts
// Polling-only (sem WebSocket) – compatível com ProductionStats e ThreeDModel.

import { useCallback, useEffect, useRef, useState } from "react";
import { getOpcHistoryByName } from "@/lib/api";

export type OpcEvent = {
  type: "opc_event";
  ts_utc: string;
  name: string;
  value_bool?: boolean;
  value_num?: number;
};

type Options = {
  name?: string;   // ex.: "Avancado_1S2"
  all?: boolean;   // ignorado no modo polling (mantido por compat)
  pollMs?: number; // default: 500ms
};

// extrai vetor de registros de uma payload que pode ser array ou objeto com items
function rowsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const k of ["items", "rows", "data", "history", "results", "records"]) {
      const arr = (payload as any)[k];
      if (Array.isArray(arr)) return arr;
    }
  }
  return [];
}

function coerceBool(raw: any): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "1" || s === "true" || s === "on") return true;
  if (s === "0" || s === "false" || s === "off") return false;
  if (raw === 1) return true;
  if (raw === 0) return false;
  return undefined;
}

export function useOpcStream(opts?: Options) {
  const name = opts?.name?.trim();
  const pollMs = Math.max(200, opts?.pollMs ?? 500);

  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<OpcEvent | null>(null);

  const byNameRef = useRef<Record<string, OpcEvent>>({});
  const timerRef = useRef<number | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    if (!name) {
      setConnected(false);
      setLast(null);
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const tick = async () => {
      try {
        const payload = await getOpcHistoryByName({
          name,
          since: "-10s",
          asc: true,
        }).catch(() => []);

        const rows = rowsFromPayload(payload);
        if (rows.length) {
          const r = rows[rows.length - 1] as any;

          const ts =
            r.ts_utc ??
            r.ts ??
            r.timestamp ??
            r.time ??
            r.created_at ??
            new Date().toISOString();

          const raw =
            r.value ??
            r.value_bool ??
            r.v ??
            r.state ??
            r.val ??
            r.bool ??
            r.number ??
            null;

          const vb = coerceBool(raw);
          const vn =
            typeof raw === "number"
              ? raw
              : raw === "1"
              ? 1
              : raw === "0"
              ? 0
              : vb === true
              ? 1
              : vb === false
              ? 0
              : undefined;

          const evt: OpcEvent = {
            type: "opc_event",
            ts_utc: String(ts),
            name,
            value_bool: vb,
            value_num: vn,
          };

          byNameRef.current[name] = evt;
          if (aliveRef.current) setLast(evt);
        }

        if (aliveRef.current) setConnected(true);
      } catch {
        if (aliveRef.current) setConnected(false);
      } finally {
        if (aliveRef.current) {
          timerRef.current = window.setTimeout(tick, pollMs) as unknown as number;
        }
      }
    };

    tick();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [name, pollMs]);

  const getByName = useCallback((qname: string) => byNameRef.current[qname] ?? null, []);

  return { connected, last, getByName };
}
