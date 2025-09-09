// src/components/dashboard/MiniSparkline.tsx
// Sparkline minimalista em SVG para mostrar tendência dos KPIs
// - Recebe vetor de números, normaliza e desenha linha + preenchimento leve
// - Sem dependências extras

import React from "react";

type Props = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: string;
};

export default function MiniSparkline({
  data,
  width = 100,
  height = 40,
  color = "currentColor",
  fill = "rgba(0,0,0,0.1)",
}: Props) {
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="4 2"
        />
      </svg>
    );
  }

  // Normaliza dados em [0,1]
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const norm = data.map((v) => (v - min) / span);

  // Gera pontos em coordenadas SVG
  const step = width / (data.length - 1);
  const points = norm.map((v, i) => [i * step, height - v * height]);

  const pathD = points
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(" ");

  // Área preenchida
  const fillD =
    pathD +
    ` L${width},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <path d={fillD} fill={fill} stroke="none" />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
