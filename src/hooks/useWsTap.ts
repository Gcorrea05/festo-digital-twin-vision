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
  try {
    // se for WebSocket nativo
    if (typeof WebSocket !== "undefined" && h instanceof WebSocket) {
      return { stop: () => h.close() };
    }
  } catch {}
  return { stop: () => {} }; // no-op
}

function safeParse(raw: unknown): any {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

export function useWsTap(
  maxItems: number = 200,
  channels: TapChannel[] = ["live", "monitoring", "slow"]
) {
  const [buf, setBuf] = useState<TapEntry[]>([]);
  const [status, setStatus] = useState<Record<TapChannel, TapStatus>>({
    live:       { state: "idle" },
    monitoring: { state: "idle" },
    slow:       { state: "idle" },
  });

  const handlesRef = useRef<StopHandle[]>([]);

  useEffect(() => {
    const chans = Array.from(new Set(channels)) as TapChannel[];

    const upd = (ch: TapChannel, patch: Partial<TapStatus>) =>
      setStatus((s: Record<TapChannel, TapStatus>) => ({
        ...s,
        [ch]: { ...(s[ch] ?? { state: "idle" }), ...patch } as TapStatus,
      }));

    const openFor = (ch: TapChannel): StopHandle => {
      upd(ch, { state: "connecting" });

      const onOpen   = () =>  upd(ch, { state: "open", lastOpenAt: Date.now() });
      const onClose  = () =>  upd(ch, { state: "closed", lastCloseAt: Date.now() });
      const onError  = (e?: unknown) => upd(ch, { state: "error", lastError: String(e ?? "unknown") });
      const onMsg    = (m: any) => {
        const raw = typeof m === "string" ? m : (typeof m?.data === "string" ? m.data : undefined);
        const payload = raw !== undefined ? safeParse(raw) : (m?.data ?? m);
        setBuf((prev: TapEntry[]) => {
          const next = [...prev, { ch, at: Date.now(), msg: payload, raw }];
          if (next.length > maxItems) next.splice(0, next.length - maxItems);
          return next;
        });
      };

      // aceita qualquer formato de handle dos seus wrappers
      let h: any;
      if (ch === "live")          h = openLiveWS({ onOpen, onClose, onError, onMessage: onMsg });
      else if (ch === "monitoring") h = openMonitoringWS({ onOpen, onClose, onError, onMessage: onMsg });
      else                         h = openSlowWS({ onOpen, onClose, onError, onMessage: onMsg });

      return toStopHandle(h);
    };

    const hs = chans.map(openFor);
    handlesRef.current = hs;

    return () => {
      hs.forEach((h) => { try { h.stop(); } catch {} });
      handlesRef.current = [];
      setStatus((s: Record<TapChannel, TapStatus>) => {
        const copy: Record<TapChannel, TapStatus> = { ...s };
        chans.forEach((ch) => { copy[ch] = { ...(copy[ch] ?? { state: "idle" }), state: "closing" }; });
        return copy;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxItems, JSON.stringify(Array.from(new Set(channels)))]);

  const clear = () => setBuf([]);
  const last50 = useMemo(() => buf.slice(-50), [buf]);

  return { buffer: buf, last50, status, clear };
}

export default useWsTap;
