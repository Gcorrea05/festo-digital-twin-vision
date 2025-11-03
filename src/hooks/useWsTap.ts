// src/hooks/useWsTap.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { openLiveWS, openMonitoringWS, openSlowWS } from "@/lib/api";

export type TapChannel = "live" | "monitoring" | "slow";

export type TapEntry = {
  ch: TapChannel;
  at: number;
  msg: any;
  raw?: string;
};

export type TapStatus = {
  state: "idle" | "connecting" | "open" | "closing" | "closed" | "error";
  lastError?: string;
  lastOpenAt?: number;
  lastCloseAt?: number;
};

type StopHandle = { stop: () => void };

// ---- adapter p/ qualquer handle virar { stop() } ----
function toStopHandle(h: any): StopHandle {
  if (h && typeof h.stop === "function") return { stop: () => h.stop() };
  if (h && typeof h.close === "function") return { stop: () => h.close() };

  // WebSocket nativo (browser-only)
  const isBrowser = typeof window !== "undefined" && typeof (window as any).WebSocket !== "undefined";
  if (isBrowser) {
    try {
      const WS: any = (window as any).WebSocket;
      if (h instanceof WS) return { stop: () => h.close() };
    } catch {
      // ignore
    }
  }
  return { stop: () => {} }; // no-op
}

function safeParse(raw: unknown): any {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function useWsTap(
  maxItems: number = 200,
  channels: TapChannel[] = ["live", "monitoring", "slow"]
) {
  const [buf, setBuf] = useState<TapEntry[]>([]);
  const [status, setStatus] = useState<Record<TapChannel, TapStatus>>({
    live: { state: "idle" },
    monitoring: { state: "idle" },
    slow: { state: "idle" },
  });

  const handlesRef = useRef<StopHandle[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // SSR safe
    if (typeof window === "undefined") {
      return;
    }

    // preserva ordem e remove duplicados
    const seen = new Set<TapChannel>();
    const chans = channels.filter((c) => {
      if (seen.has(c)) return false;
      seen.add(c);
      return true;
    }) as TapChannel[];

    const upd = (ch: TapChannel, patch: Partial<TapStatus>) => {
      if (!mountedRef.current) return;
      setStatus((s) => ({
        ...s,
        [ch]: { ...(s[ch] ?? { state: "idle" }), ...patch } as TapStatus,
      }));
    };

    const onMsgFactory = (ch: TapChannel) => (m: any) => {
      const raw = typeof m === "string" ? m : typeof m?.data === "string" ? m.data : undefined;
      const payload = raw !== undefined ? safeParse(raw) : m?.data ?? m;
      if (!mountedRef.current) return;
      setBuf((prev) => {
        const next = [...prev, { ch, at: Date.now(), msg: payload, raw }];
        if (next.length > maxItems) next.splice(0, next.length - maxItems);
        return next;
      });
    };

    const openFor = (ch: TapChannel): StopHandle => {
      upd(ch, { state: "connecting" });
      const onOpen = () => upd(ch, { state: "open", lastOpenAt: Date.now() });
      const onClose = () => upd(ch, { state: "closed", lastCloseAt: Date.now() });
      const onError = (e?: unknown) =>
        upd(ch, { state: "error", lastError: e ? String(e) : "unknown" });
      const onMessage = onMsgFactory(ch);

      let h: any;
      if (ch === "live") {
        h = openLiveWS({ onOpen, onClose, onError, onMessage });
      } else if (ch === "monitoring") {
        h = openMonitoringWS({ onOpen, onClose, onError, onMessage });
      } else {
        h = openSlowWS({ onOpen, onClose, onError, onMessage });
      }
      return toStopHandle(h);
    };

    // abre todos os canais solicitados
    const hs = chans.map(openFor);
    handlesRef.current = hs;

    return () => {
      // encerra sockets
      hs.forEach((h) => {
        try {
          h.stop();
        } catch {
          /* noop */
        }
      });
      handlesRef.current = [];
      // não altera state aqui para evitar setState após unmount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxItems, JSON.stringify([...new Set(channels)])]);

  const clear = () => setBuf([]);
  const last50 = useMemo(() => buf.slice(-50), [buf]);

  return { buffer: buf, last50, status, clear };
}

export default useWsTap;
