// src/hooks/useOpcStream.ts (refatorado)
import { useCallback, useEffect, useRef, useState } from "react";
import { openOpcWS, WSClient } from "@/lib/ws";

export type OpcEvent = {
  type: "opc_event";
  ts_utc: string;
  name: string;
  value_bool?: boolean;
  value_num?: number;
};

type Options = { name?: string; all?: boolean };

export function useOpcStream(opts?: Options) {
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<OpcEvent | null>(null);

  // Dicionário com o último evento por sinal (mutável, não dispara render)
  const byNameRef = useRef<Record<string, OpcEvent>>({});
  const clientRef = useRef<WSClient | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // encerra a conexão anterior se existir
    clientRef.current?.close();

    const client = openOpcWS({
      all: opts?.all ?? !opts?.name,
      name: opts?.name,
      onOpen: () => mountedRef.current && setConnected(true),
      onClose: () => mountedRef.current && setConnected(false),
      onError: () => mountedRef.current && setConnected(false),
      onMessage: (m: unknown) => {
        // esperamos { type: "opc_event", ... }
        if (!mountedRef.current) return;
        if (m && typeof m === "object" && (m as any).type === "opc_event") {
          const evt = m as OpcEvent;
          byNameRef.current[evt.name] = evt;
          setLast(evt);
        }
      },
    });

    clientRef.current = client;

    return () => {
      // fecha e invalida referência
      client.close();
      clientRef.current = null;
    };
    // reabre se name/all mudarem
  }, [opts?.name, opts?.all]);

  // getter memorizado para evitar recriações desnecessárias
  const getByName = useCallback((name: string) => {
    return byNameRef.current[name] ?? null;
  }, []);

  return {
    connected,
    last,
    getByName,
  };
}
