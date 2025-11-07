// src/components/monitoring/LiveMetricsMon.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLive } from "@/context/LiveContext";
import {
  openMonitoringWS,
  openSlowWS,
  type WSMessageMonitoring,
  type WSMessageCPM,
  type AnyWSMessage,
} from "@/lib/api";

type Props = { selectedId: 1 | 2 };

function n(x: any): number | null {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}
function msFromEitherSecondsOrMs(secField?: any, msField?: any): number | null {
  const ms = n(msField);
  if (ms != null) return ms >= 0 ? Math.round(ms) : null;
  const sec = n(secField);
  if (sec == null) return null;
  const ms2 = sec * 1000;
  return Number.isFinite(ms2) && ms2 >= 0 ? Math.round(ms2) : null;
}
function pickFirst<T = any>(...vals: any[]): T | null {
  for (const v of vals) if (v !== undefined && v !== null) return v as T;
  return null;
}
async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}
function safeSet(setter: React.Dispatch<React.SetStateAction<number | null>>, value: number | null) {
  if (value == null) return;
  setter(value);
}
function safeSetPositive(setter: React.Dispatch<React.SetStateAction<number | null>>, value: number | null) {
  if (value == null) return;
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return;
  setter(Math.round(v));
}
function normalizeMs(v: any): number | null {
  const num = n(v);
  if (num == null || !Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}
function fmtMs(ms: number | null | undefined): string {
  const v = n(ms);
  if (v == null || !Number.isFinite(v) || v < 0) return "—";
  return `${Math.round(v)} ms`;
}

// ---- Vib helpers
function normalizeOverallG(item: any): number | null {
  if (!item || typeof item !== "object") return null;
  let g =
    n(item?.overall_rms_ac) ??
    n(item?.rms) ??
    n(item?.overall_rms) ??
    n(item?.overall) ??
    n(item?.v_overall) ??
    n(item?.value) ??
    null;
  if (g == null) return null;
  if (Math.abs(g) > 20) g = g / 1000; // mg -> g (heurístico)
  return Number.isFinite(g) ? g : null;
}
function parseVibrationOverall(payload: any, mpuId: number): number | null {
  if (!payload) return null;
  const arrays =
    payload?.items ||
    payload?.overall_by_mpu ||
    payload?.by_mpu ||
    payload?.list ||
    (Array.isArray(payload) ? payload : null);
  if (Array.isArray(arrays)) {
    const it = arrays.find((x) => {
      const mid = n(x?.mpu_id) ?? n(x?.id);
      return mid === mpuId;
    });
    return normalizeOverallG(it);
  }
  if (typeof payload === "object") {
    const mid = n(payload?.mpu_id) ?? n(payload?.id);
    if (mid === mpuId) return normalizeOverallG(payload);
  }
  return null;
}

// ---- Timings
function parseTimingsLike(obj: any) {
  if (!obj) return { openMs: null, closeMs: null, cycleMs: null };
  const openMs = msFromEitherSecondsOrMs(
    pickFirst(obj?.dt_abre_s, obj?.dtOpen_s, obj?.open_s, obj?.abre_s),
    pickFirst(obj?.dt_abre_ms, obj?.dtOpen_ms, obj?.open_ms, obj?.abre_ms)
  );
  const closeMs = msFromEitherSecondsOrMs(
    pickFirst(obj?.dt_fecha_s, obj?.dtClose_s, obj?.close_s, obj?.fecha_s),
    pickFirst(obj?.dt_fecha_ms, obj?.dtClose_ms, obj?.close_ms, obj?.fecha_ms)
  );
  const cycleMsRaw =
    msFromEitherSecondsOrMs(
      pickFirst(obj?.dt_ciclo_s, obj?.dtCycle_s, obj?.cycle_s, obj?.ciclo_s),
      pickFirst(obj?.dt_ciclo_ms, obj?.dtCycle_ms, obj?.cycle_ms, obj?.ciclo_ms)
    ) ?? (openMs != null && closeMs != null ? openMs + closeMs : null);

  const cycleMs = normalizeMs(cycleMsRaw);
  return { openMs: normalizeMs(openMs), closeMs: normalizeMs(closeMs), cycleMs };
}
type ParsedTimings = { openMs: number | null; closeMs: number | null; cycleMs: number | null };
function extractTimingsFromMessage(msg: any, actuatorId: number): ParsedTimings {
  const pools = [msg?.timings, msg?.actuators, msg?.timings_by_actuator, msg?.timings_list];
  let candidate: any = null;
  for (const pool of pools) {
    if (Array.isArray(pool)) {
      const found = pool.find((a) => (n(a?.actuator_id) ?? n(a?.id)) === actuatorId);
      if (found) candidate = found;
    } else if (pool && typeof pool === "object") {
      const entries = Object.values(pool as Record<string, any>);
      const found = entries.find((a) => (n(a?.actuator_id) ?? n(a?.id)) === actuatorId);
      if (found) candidate = found;
    }
  }
  if (!candidate) return { openMs: null, closeMs: null, cycleMs: null };
  const raw = candidate?.last ?? candidate?.latest ?? candidate;
  let { openMs, closeMs, cycleMs } = parseTimingsLike(raw);
  const fixNum = (v: any) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
  if (!openMs || openMs <= 0) {
    if (raw?.dt_abre_ms != null) openMs = fixNum(raw.dt_abre_ms);
    else if (raw?.dt_abre_s != null) openMs = fixNum(Number(raw.dt_abre_s) * 1000);
  }
  if (!closeMs || closeMs <= 0) {
    if (raw?.dt_fecha_ms != null) closeMs = fixNum(raw.dt_fecha_ms);
    else if (raw?.dt_fecha_s != null) closeMs = fixNum(Number(raw.dt_fecha_s) * 1000);
  }
  if (!cycleMs || cycleMs <= 0) {
    if (raw?.dt_ciclo_ms != null) cycleMs = fixNum(raw.dt_ciclo_ms);
    else if (raw?.dt_ciclo_s != null) cycleMs = fixNum(Number(raw.dt_ciclo_s) * 1000);
    else if (openMs && closeMs) cycleMs = openMs + closeMs;
  }
  return { openMs: openMs ?? null, closeMs: closeMs ?? null, cycleMs: cycleMs ?? null };
}

/* ====================================================================== */

const LiveMetricsMon: React.FC<Props> = ({ selectedId }) => {
  const { snapshot } = useLive();

  // Sistema Ligado (derivado dos atuadores — sem snapshot.system)
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE" | "—">(() => {
    const acts = snapshot?.actuators ?? [];
    if (!acts.length) return "—";
    const allUnknown = acts.every((a: any) => a?.state === "DESCONHECIDO");
    if (allUnknown) return "OFFLINE";
    const anyPending = acts.some((a: any) => !!a?.pending);
    return anyPending ? "DEGRADED" : "OK";
  }, [snapshot?.actuators]);

  // Métricas
  const [cpm, setCpm] = useState<number | null>(null);
  const [vibOverall, setVibOverall] = useState<number | null>(null);
  const [tOpenMs, setTOpenMs] = useState<number | null>(null);
  const [tCloseMs, setTCloseMs] = useState<number | null>(null);
  const [tCycleMs, setTCycleMs] = useState<number | null>(null);

  // Latch de sensores (ONLINE se chegou vib recentemente; janela 8s)
  const [lastVibAt, setLastVibAt] = useState<number | null>(null);
  const sensorsOnline = useMemo(() => {
    if (!lastVibAt) return false;
    return Date.now() - lastVibAt < 8000; // 8s de tolerância
  }, [lastVibAt]);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => void (aliveRef.current = false);
  }, []);

  // WS monitoring: timings + vib
  useEffect(() => {
    const handleMonitoring = (msg: WSMessageMonitoring) => {
      const { openMs, closeMs, cycleMs } = extractTimingsFromMessage(msg, selectedId);
      const vPayload = (msg as any)?.vibration || (Array.isArray(msg as any) ? (msg as any) : undefined);
      const overall = parseVibrationOverall(vPayload, selectedId);

      if (!aliveRef.current) return;

      // Latch vib (marca recência)
      if (overall != null && Number.isFinite(Number(overall))) {
        setLastVibAt(Date.now());
      }
      safeSetPositive(setTOpenMs, openMs);
      safeSetPositive(setTCloseMs, closeMs);
      safeSetPositive(setTCycleMs, cycleMs);
      safeSet(setVibOverall, overall);
    };

    const wsMon = openMonitoringWS({
      onMessage: (m: AnyWSMessage) => {
        if (m.type === "monitoring" || (m as any)?.vibration) {
          handleMonitoring(m as WSMessageMonitoring);
        }
      },
    });

    return () => wsMon.close();
  }, [selectedId]);

  // WS slow: CPM (latch)
  useEffect(() => {
    const handleCpm = (msg: WSMessageCPM) => {
      const arr = msg.items || msg.actuators || ([] as any[]);
      const item = (arr as any[]).find((a) => {
        const aid = n(a?.id) ?? n(a?.actuator_id);
        return aid === selectedId;
      });
      const v = pickFirst(n(item?.cpm), n(item?.cpm_1min), n(item?.cpm_60s));
      if (!aliveRef.current) return;
      if (v != null && Number.isFinite(Number(v)) && Number(v) >= 0) {
        setCpm(Number(v));
      }
    };
    const wsSlow = openSlowWS({
      onMessage: (m: AnyWSMessage) => {
        if (m.type === "cpm") handleCpm(m as WSMessageCPM);
      },
    });
    return () => wsSlow.close();
  }, [selectedId]);

  // Fallbacks HTTP
  useEffect(() => {
    let stop = false;
    const fetchFallback = async () => {
      try {
        const data = await fetchJson("/api/monitoring/snapshot");

        const mpuId = selectedId;
        const vSrc =
          data?.vibration?.items ||
          data?.vibration?.overall_by_mpu ||
          data?.vibration?.by_mpu ||
          data?.vibration?.list ||
          data?.vibration ||
          [];
        const vItem = (Array.isArray(vSrc) ? vSrc : [vSrc]).find((it: any) => {
          const mid = n(it?.mpu_id) ?? n(it?.id);
          return mid === mpuId;
        });
        const overall = normalizeOverallG(vItem);
        if (overall != null && Number.isFinite(Number(overall))) {
          setLastVibAt(Date.now());
        }
        safeSet(setVibOverall, overall);

        const pools = [data?.timings, data?.actuators, data?.timings_by_actuator];
        let act: any = null;
        for (const pool of pools) {
          if (Array.isArray(pool)) act = pool.find((a) => (n(a?.actuator_id) ?? n(a?.id)) === mpuId) ?? act;
        }
        const { openMs, closeMs, cycleMs } = extractTimingsFromMessage({ timings: [act] }, mpuId);

        if (!aliveRef.current || stop) return;
        safeSetPositive(setTOpenMs, openMs);
        safeSetPositive(setTCloseMs, closeMs);
        safeSetPositive(setTCycleMs, cycleMs);
      } catch {}
    };
    fetchFallback();
    const id = setInterval(fetchFallback, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [selectedId]);

  useEffect(() => {
    let stop = false;
    const pollTimings = async () => {
      try {
        const data = await fetchJson("/api/live/actuators/timings");
        const pools = [data?.actuators, data?.timings, data?.timings_by_actuator];
        let act: any = null;
        for (const pool of pools) {
          if (Array.isArray(pool)) act = pool.find((a) => (n(a?.actuator_id) ?? n(a?.id)) === selectedId) ?? act;
        }
        const { openMs, closeMs, cycleMs } = extractTimingsFromMessage({ timings: [act] }, selectedId);
        if (!aliveRef.current || stop) return;
        safeSetPositive(setTOpenMs, openMs);
        safeSetPositive(setTCloseMs, closeMs);
        safeSetPositive(setTCycleMs, cycleMs);
      } catch {}
    };
    pollTimings();
    const id = setInterval(pollTimings, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [selectedId]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {[
        // 1ª linha (nova ordem)
        { title: "Status do Atuador", value: systemText },
        {
          title: "Vibração",
          value: vibOverall != null ? `${(vibOverall - 1).toFixed(3)} g` : "—",
        },
        { title: "Ciclos por minuto", value: cpm != null ? cpm.toFixed(1) : "—" },
        // 2ª linha (igual)
        { title: "Tempo para Abrir", value: fmtMs(tOpenMs) },
        { title: "Tempo para Fechar", value: fmtMs(tCloseMs) },
        { title: "Tempo do Ciclo", value: fmtMs(tCycleMs) },
      ].map((it) => (
        <Card key={it.title} className="bg-[#0E1624] border-transparent">
          <CardHeader>
            <CardTitle className="text-base text-slate-200">{it.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold leading-none tracking-tight text-white">
              {it.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default React.memo(LiveMetricsMon);
