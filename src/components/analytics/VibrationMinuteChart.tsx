import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getMinuteAgg, MinuteAggPoint } from "@/lib/api";

type Props = {
  act: "A1" | "A2";
  since?: string;      // janela de busca (ex.: "-2h")
  pollMs?: number;     // atualização periódica
};

const DEFAULT_SINCE = "-2h";
const DEFAULT_POLL = 60000; // 60s

export const VibrationMinuteChart: React.FC<Props> = ({
  act,
  since = DEFAULT_SINCE,
  pollMs = DEFAULT_POLL,
}) => {
  const [rows, setRows] = useState<MinuteAggPoint[]>([]);
  const timerRef = useRef<number | null>(null);

  const fetchData = async () => {
    const data = await getMinuteAgg({ act, since });
    // filtra somente pontos com vibração (média do minuto) e runtime válido
    const cleaned = data
      .filter((d) => typeof d.vib_avg === "number" && typeof d.runtime_s === "number")
      .sort((a, b) => (a.minute_iso < b.minute_iso ? -1 : 1));
    setRows(cleaned);
  };

  useEffect(() => {
    fetchData();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(fetchData, pollMs);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [act, since, pollMs]);

  // prepara eixos: x = runtime (segundos), y = vib_avg (unidade do seu MPU)
  const data = useMemo(
    () =>
      rows.map((r) => ({
        minute: r.minute_iso,
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
            tickFormatter={(v) => `${v}s`}
            label={{ value: "Runtime (s/min)", position: "insideBottom", offset: -2 }}
          />
          <YAxis
            dataKey="vib_avg"
            label={{ value: "Vibração (média/min)", angle: -90, position: "insideLeft" }}
          />
          <Tooltip
            formatter={(val: number, name) =>
              name === "vib_avg" ? [`${val.toFixed(3)}`, "Vibração (avg)"] : [`${val}s`, "Runtime"]
            }
            labelFormatter={(label) => new Date(label).toLocaleTimeString()}
          />
          <Line type="monotone" dataKey="vib_avg" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
      <div className="text-xs opacity-70 mt-2">
        Atualiza a cada 60 s · janela {since} · atuador {act}
      </div>
    </div>
  );
};

export default VibrationMinuteChart;
