// src/components/analytics/VibrationMinuteChart.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getMinuteAgg, getApiBase } from "@/lib/api";

type Props = {
  act: "A1" | "A2";
  since?: string;      // ex.: "-10m"
  pollMs?: number;     // fallback: 60s
};

const DEFAULT_SINCE = "-10m";
const DEFAULT_POLL = 60_000;

// ponto interno usado pelo gráfico
type MinuteAggPoint = { t: number; minute: string; runtime_s: number; vib_avg: number };

// parse ISO com Z ou -03:00
const toTs = (iso: string) => {
  const d = new Date(iso);
  const t = d.getTime();
  return Number.isFinite(t) ? t : Date.parse(String(iso || "").replace("Z", "+00:00"));
};

// converte janela relativa p/ ms (bem simples)
const windowMsFromSince = (since: string) => {
  const s = (since || "").trim().toLowerCase();
  const m = s.match(/-(\d+)\s*([hms])?/);
  if (!m) return 10 * 60 * 1000;
  const qty = Number(m[1] || 10);
  const unit = (m[2] || "m") as "s" | "m" | "h";
  const mult = unit === "h" ? 3600 : unit === "m" ? 60 : 1;
  return qty * mult * 1000;
};

export const VibrationMinuteChart: React.FC<Props> = ({
  act,
  since = DEFAULT_SINCE,
  pollMs = DEFAULT_POLL,
}) => {
  const [rows, setRows] = useState<MinuteAggPoint[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);

  const windowMs = useMemo(() => windowMsFromSince(since), [since]);
  const actuatorId = act === "A1" ? 1 : 2;

  // adiciona 1 ponto mantendo a janela
  const pushPoint = (minuteIso: string, runtime_s: number, vib_avg_raw: number | null) => {
    const t = toTs(minuteIso);
    if (!Number.isFinite(t)) return;

    // enquanto backend manda null, usamos 0 (ajustamos depois)
    const vib = vib_avg_raw == null ? 0 : Number(vib_avg_raw);
    const run = Number(runtime_s || 0);

    setRows((prev) => {
      const cut = Date.now() - windowMs;
      const next = prev
        .filter((p) => p.t >= cut)
        .concat([{ t, minute: minuteIso, runtime_s: run, vib_avg: vib }])
        .sort((a, b) => a.t - b.t);
      return next;
    });
  };

  // WS: escuta /ws/analytics e adiciona pontos do atuador selecionado
  useEffect(() => {
    // fecha antigo
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    // abre novo
    const base = getApiBase?.() || "http://localhost:8000";
    const wsUrl = base.replace(/^http/i, "ws") + "/ws/analytics";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === "analytics-minute-agg" && Number(msg.actuator) === actuatorId) {
          pushPoint(String(msg.minute), Number(msg.runtime_s ?? 0), msg.vib_avg == null ? null : Number(msg.vib_avg));
        }
      } catch {
        // ignore
      }
    };
    ws.onclose = () => { wsRef.current = null; };

    return () => {
      if (wsRef.current) try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    };
  }, [actuatorId]);

  // Fallback HTTP polling (preenche histórico e repete a cada pollMs)
  const fetchData = async () => {
    const raw = await getMinuteAgg(act, since).catch(() => [] as any[]);
    const normalized: MinuteAggPoint[] = (Array.isArray(raw) ? raw : [])
      .map((r: any) => {
        const minute = String(r.minute ?? r.minute_iso ?? new Date().toISOString());
        const vib = r.vib_avg == null ? 0 : Number(r.vib_avg); // <- não descarta null
        const run = Number(r.runtime_s ?? 0);
        return { t: toTs(minute), minute, runtime_s: run, vib_avg: vib };
      })
      .filter((d) => Number.isFinite(d.t)) // só exige timestamp
      .sort((a, b) => a.t - b.t);
    setRows(normalized);
  };

  useEffect(() => {
    fetchData();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(fetchData, pollMs) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [act, since, pollMs]);

  // dados para o Recharts: x = runtime (s), y = vib_avg
  const data = useMemo(
    () =>
      rows.map((r) => ({
        minute: r.minute,                 // tooltip usa isso p/ horário
        runtime_s: Number(r.runtime_s ?? 0),
        vib_avg: Number(r.vib_avg ?? 0),
      })),
    [rows]
  );

  return (
    <div className="w-full h-[360px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="runtime_s"
            tickFormatter={(v: unknown) => `${Number(v ?? 0)}s`}
            label={{ value: "Runtime (s/min)", position: "insideBottom", offset: -2 }}
          />
          <YAxis
            dataKey="vib_avg"
            label={{ value: "Vibração (média/min)", angle: -90, position: "insideLeft" }}
          />
          <Tooltip
            formatter={(val: unknown, name: unknown) => {
              const n = Number(val as any);
              if (name === "vib_avg") return [Number.isFinite(n) ? n.toFixed(3) : "—", "Vibração (avg)"];
              if (name === "runtime_s") return [`${Number.isFinite(n) ? n : 0}s`, "Runtime"];
              return [String(val ?? ""), String(name ?? "")];
            }}
            labelFormatter={(label: unknown, payloadArr: Array<{ payload?: any }>) => {
              const minute = payloadArr?.[0]?.payload?.minute as string | undefined;
              if (!minute) return "";
              const d = new Date(minute);
              return Number.isNaN(d.getTime())
                ? minute
                : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            }}
          />
          <Line type="monotone" dataKey="vib_avg" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
      <div className="text-xs opacity-70 mt-2">
        Atualiza por push (WS /ws/analytics) · Fallback {Math.round(pollMs / 1000)}s · Janela {since} · Atuador {act}
      </div>
    </div>
  );
};

export default VibrationMinuteChart;
