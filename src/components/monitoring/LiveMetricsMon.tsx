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

/* ------------------- helpers ------------------- */
function n(x: any): number | null {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

/**
 * Converte segundos (campo *_s) ou milissegundos (campo *_ms) para ms (inteiro).
 * - Se vier negativo/NaN → retorna null (para renderizar "—").
 */
function msFromEitherSecondsOrMs(secField?: any, msField?: any): number | null {
  const ms = n(msField);
  if (ms != null) return ms >= 0 ? Math.round(ms) : null;
  const sec = n(secField);
  if (sec == null) return null;
  const ms2 = sec * 1000;
  return Number.isFinite(ms2) && ms2 >= 0 ? Math.round(ms2) : null;
}

function pickFirst<T = any>(...vals: any[]): T | null {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v as T;
  }
  return null;
}
async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** Evita sobrescrever com null. */
function safeSet(
  setter: React.Dispatch<React.SetStateAction<number | null>>,
  value: number | null
) {
  if (value == null) return;
  setter(value);
}

/** ⭐ Só grava se for positivo (>0). Mantém último valor bom. */
function safeSetPositive(
  setter: React.Dispatch<React.SetStateAction<number | null>>,
  value: number | null
) {
  if (value == null) return;
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return;
  setter(Math.round(v));
}

/** Normaliza ms para estado (inteiro não-negativo) ou null. */
function normalizeMs(v: any): number | null {
  const num = n(v);
  if (num == null || !Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

/** Formata ms para exibição. Null/NaN/negativo → "—". */
function fmtMs(ms: number | null | undefined): string {
  const v = n(ms);
  if (v == null || !Number.isFinite(v) || v < 0) return "—";
  return `${Math.round(v)} ms`;
}
/* ------------------------------------------------ */

// Preferência de campos para “g RMS” de vibração (mantido do seu código anterior)
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

// Normalizador de timings (aceita vários alias)
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
    ) ??
    (openMs != null && closeMs != null ? openMs + closeMs : null);

  const cycleMs = normalizeMs(cycleMsRaw);
  return { openMs: normalizeMs(openMs), closeMs: normalizeMs(closeMs), cycleMs };
}
// ------------------- Timings helpers com logs & autocorreção -------------------
type ParsedTimings = {
  openMs: number | null;
  closeMs: number | null;
  cycleMs: number | null;
};

function extractTimingsFromMessage(
  msg: any,
  actuatorId: number
): ParsedTimings {
  const pools = [
    msg?.timings,
    msg?.actuators,
    msg?.timings_by_actuator,
    msg?.timings_list,
  ];

  let candidate: any = null;

  for (const pool of pools) {
    if (Array.isArray(pool)) {
      const found = pool.find(
        (a) => (n(a?.actuator_id) ?? n(a?.id)) === actuatorId
      );
      if (found) candidate = found;
    } else if (pool && typeof pool === "object") {
      const entries = Object.values(pool as Record<string, any>);
      const found = entries.find(
        (a) => (n(a?.actuator_id) ?? n(a?.id)) === actuatorId
      );
      if (found) candidate = found;
    }
  }

  if (!candidate) {
    console.log("[MON] no-candidate", { actuatorId, msg });
    return { openMs: null, closeMs: null, cycleMs: null };
  }

  const raw =
    candidate?.last != null
      ? candidate.last
      : candidate?.latest != null
      ? candidate.latest
      : candidate;

  console.log("[MON] candidate=", candidate);
  console.log("[MON] base(raw)=", raw);

  let { openMs, closeMs, cycleMs } = parseTimingsLike(raw);

  // AUTOCORREÇÃO (se parse deu 0/null mas o raw tem números válidos)
  const fixNum = (v: any) =>
    Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null;

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

  console.log("[MON] parsed=", { actuatorId, openMs, closeMs, cycleMs });
  return { openMs: openMs ?? null, closeMs: closeMs ?? null, cycleMs: cycleMs ?? null };
}

const LiveMetricsMon: React.FC<Props> = ({ selectedId }) => {
  const { snapshot } = useLive();

  // ====== NOVO: status do sistema (mesma ideia do projeto antigo)
  // Regra: qualquer atividade recente -> OK; 4s–12s sem atividade -> DEGRADED; >=12s -> OFFLINE.
  const lastActivityRef = useRef<number>(Date.now());
  const [systemStatus, setSystemStatus] = useState<"OK" | "DEGRADED" | "OFFLINE">("OFFLINE");

  // Bootstrap rápido via /api/health (tal como no código antigo)
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const h = await fetchJson("/api/health");
        if (stop) return;
        // se respondeu, consideramos ativo
        lastActivityRef.current = Date.now();
        setSystemStatus("OK");
      } catch {
        if (stop) return;
        setSystemStatus("OFFLINE");
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  // Watchdog de inatividade (idêntico em comportamento ao antigo)
  useEffect(() => {
    const id = setInterval(() => {
      const dt = Date.now() - lastActivityRef.current;
      if (dt < 4000) setSystemStatus("OK");
      else if (dt < 12000) setSystemStatus("DEGRADED");
      else setSystemStatus("OFFLINE");
    }, 1000);
    return () => clearInterval(id);
  }, []);
  // ====== FIM status do sistema

  const [cpm, setCpm] = useState<number | null>(null);
  const [vibOverall, setVibOverall] = useState<number | null>(null);
  const [tOpenMs, setTOpenMs] = useState<number | null>(null);
  const [tCloseMs, setTCloseMs] = useState<number | null>(null);
  const [tCycleMs, setTCycleMs] = useState<number | null>(null);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => void (aliveRef.current = false);
  }, []);

  /* ---------- WS /monitoring: timings + vib (principal) ---------- */
  useEffect(() => {
    const handleMonitoring = (msg: WSMessageMonitoring) => {
      // Qualquer mensagem recebida conta como atividade do sistema
      lastActivityRef.current = Date.now();

      // Log bruto (clonado para ficar legível)
      try {
        const clone = (globalThis as any).structuredClone
          ? (structuredClone as any)(msg)
          : JSON.parse(JSON.stringify(msg));
        console.debug("[WS/monitoring] raw:", clone);
      } catch {
        console.debug("[WS/monitoring] raw (no-clone):", msg);
      }

      const { openMs, closeMs, cycleMs } = extractTimingsFromMessage(
        msg,
        selectedId
      );

      // Vib (overall)
      const vPayload =
        (msg as any)?.vibration ||
        (Array.isArray(msg as any) ? (msg as any) : undefined);
      const overall = parseVibrationOverall(vPayload, selectedId);

      console.debug("[WS/monitoring] parsed:", {
        selectedId,
        openMs,
        closeMs,
        cycleMs,
        overall,
      });

      if (!aliveRef.current) return;
      // só atualiza se > 0 (evita zerar com mensagens parciais)
      safeSetPositive(setTOpenMs, openMs);
      safeSetPositive(setTCloseMs, closeMs);
      safeSetPositive(setTCycleMs, cycleMs);
      safeSet(setVibOverall, overall); // vib pode ser ~1.0
    };

    const wsMon = openMonitoringWS({
      onMessage: (m: AnyWSMessage) => {
        if (m.type === "monitoring" || m.type === "vibration" || (m as any)?.vibration) {
          handleMonitoring(m as WSMessageMonitoring);
        }
      },
    });

    return () => wsMon.close();
  }, [selectedId]);

  /* ---------- WS /slow: CPM ---------- */
  useEffect(() => {
    const handleCpm = (msg: WSMessageCPM) => {
      // conta atividade também
      lastActivityRef.current = Date.now();

      const arr = msg.items || msg.actuators || msg.cpm || [];
      const item = (arr as any[]).find((a) => {
        const aid = n(a?.id) ?? n(a?.actuator_id);
        return aid === selectedId;
      });
      const v = pickFirst(n(item?.cpm), n(item?.cpm_1min), n(item?.cpm_60s));
      if (!aliveRef.current) return;
      setCpm(v);
    };

    const wsSlow = openSlowWS({
      onMessage: (m: AnyWSMessage) => {
        if (m.type === "cpm") handleCpm(m as WSMessageCPM);
      },
    });

    return () => wsSlow.close();
  }, [selectedId]);

  /* ---------- Fallback #1: /api/monitoring/snapshot (vib + dt) ---------- */
  useEffect(() => {
    let stop = false;
    const fetchFallback = async () => {
      try {
        const data = await fetchJson("/api/monitoring/snapshot");
        lastActivityRef.current = Date.now();

        try {
          const clone = (globalThis as any).structuredClone
            ? (structuredClone as any)(data)
            : JSON.parse(JSON.stringify(data));
          console.debug("[HTTP] /api/monitoring/snapshot →", clone);
        } catch {
          console.debug("[HTTP] /api/monitoring/snapshot → (no-clone)", data);
        }

        const mpuId = selectedId;

        // vib
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
        safeSet(setVibOverall, normalizeOverallG(vItem));

        // timings (usar last/latest quando existir)
        const pools = [data?.timings, data?.actuators, data?.timings_by_actuator];
        let act: any = null;
        for (const pool of pools) {
          if (Array.isArray(pool)) {
            act =
              pool.find((a) => (n(a?.actuator_id) ?? n(a?.id)) === mpuId) ?? act;
          }
        }
        const { openMs, closeMs, cycleMs } = extractTimingsFromMessage(
          { timings: [act] },
          mpuId
        ); // reaproveita a mesma função

        console.debug("[HTTP] snapshot parsed]:", {
          selectedId: mpuId,
          openMs,
          closeMs,
          cycleMs,
        });

        if (!aliveRef.current || stop) return;
        safeSetPositive(setTOpenMs, openMs);
        safeSetPositive(setTCloseMs, closeMs);
        safeSetPositive(setTCycleMs, cycleMs);
      } catch {
        /* ignora */
      }
    };

    fetchFallback();
    const id = setInterval(fetchFallback, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [selectedId]);

  /* ---------- Fallback #2: /api/live/actuators/timings (somente DT) ---------- */
  useEffect(() => {
    let stop = false;
    const pollTimings = async () => {
      try {
        const data = await fetchJson("/api/live/actuators/timings");
        lastActivityRef.current = Date.now();

        try {
          const clone = (globalThis as any).structuredClone
            ? (structuredClone as any)(data)
            : JSON.parse(JSON.stringify(data));
          console.debug("[HTTP] /api/live/actuators/timings →", clone);
        } catch {
          console.debug("[HTTP] /api/live/actuators/timings → (no-clone)", data);
        }

        const pools = [data?.actuators, data?.timings, data?.timings_by_actuator];
        let act: any = null;
        for (const pool of pools) {
          if (Array.isArray(pool)) {
            act =
              pool.find((a) => (n(a?.actuator_id) ?? n(a?.id)) === selectedId) ?? act;
          }
        }
        const { openMs, closeMs, cycleMs } = extractTimingsFromMessage(
          { timings: [act] },
          selectedId
        );

        console.debug("[HTTP] timings parsed:", {
          selectedId,
          openMs,
          closeMs,
          cycleMs,
        });

        if (!aliveRef.current || stop) return;
        safeSetPositive(setTOpenMs, openMs);
        safeSetPositive(setTCloseMs, closeMs);
        safeSetPositive(setTCycleMs, cycleMs);
      } catch {
        /* ignora */
      }
    };
    pollTimings();
    const id = setInterval(pollTimings, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [selectedId]);

  // Texto exibido no card “Sistema Ligado”
  const systemText = useMemo<"OK" | "DEGRADED" | "OFFLINE">(
    () => systemStatus,
    [systemStatus]
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {[
        { title: "Ciclos por minuto", value: cpm != null ? cpm.toFixed(1) : "—" },
        { title: "Sistema Ligado", value: systemText },
        {
          title: "Vibração",
          value: vibOverall != null ? `${(vibOverall - 1).toFixed(3)} g` : "—",
        },
        { title: "Tempo para Abrir", value: fmtMs(tOpenMs) },
        { title: "Tempo para Fechar", value: fmtMs(tCloseMs) },
        { title: "Tempo do Ciclo", value: fmtMs(tCycleMs) },
      ].map((it) => (
        <Card key={it.title}>
          <CardHeader>
            <CardTitle className="text-base">{it.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold leading-none tracking-tight">
              {it.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default React.memo(LiveMetricsMon);
