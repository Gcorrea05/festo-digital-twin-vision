// src/hooks/useOpcStream.ts
import { useEffect, useRef, useState } from "react";
import { openOpcWS, WSClient } from "@/lib/ws";

export type OpcEvent = {
  type: "opc_event";
  ts_utc: string;
  name: string;
  value_bool?: boolean;
  value_num?: number;
};

export function useOpcStream(opts?: { name?: string; all?: boolean }) {
  const [connected, setConnected] = useState(false);
  const [last, setLast] = useState<OpcEvent | null>(null);
  const byNameRef = useRef<Record<string, OpcEvent>>({});
  const clientRef = useRef<WSClient | null>(null);

  useEffect(() => {
    // fecha conexão anterior
    clientRef.current?.close();

    const client = openOpcWS({
      all: opts?.all ?? (!opts?.name),
      name: opts?.name,
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onError: () => setConnected(false),
      onMessage: (m) => {
        // esperamos { type:"opc_event", ... }
        if (m && m.type === "opc_event") {
          const evt = m as OpcEvent;
          byNameRef.current[evt.name] = evt;
          setLast(evt);
        }
      },
    });

    clientRef.current = client;
    return () => client.close();
    // reabre se name/all mudarem
  }, [opts?.name, opts?.all]);

  return {
    connected,
    last,
    // acesso opcional ao dicionário por nome
    getByName: (name: string) => byNameRef.current[name] || null,
  };
}
