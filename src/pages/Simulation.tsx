// src/pages/Simulation.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ThreeDModel from "@/components/dashboard/ThreeDModel";
import { fetchJson, postJson } from "@/lib/api"; // <-- use helpers

type CatalogItem = { id:number; code:string; name:string; grp:string; label:string; severity?:number };
type Scenario = {
  scenario_id:string; actuator:1|2;
  error:{ id:number; code:string; name:string; grp:string; severity?:number };
  cause:string; actions:string[]; params:Record<string,any>;
  ui:{ halt_sim:boolean; halt_3d:boolean; show_popup:boolean }; resume_allowed:boolean;
};

const FRIENDLY: Record<string,string> = {
  VIB_HIGH: "Vibração elevada",
  IMU_SAT: "IMU saturado",
  IMU_STUCK: "Sinal preso/deriva",
  CYCLE_SLOW: "Ciclo lento",
  STATE_STUCK: "Atuador não muda ao comando",
  NO_SAMPLES: "Sem telemetria recente",
};

export default function Simulation() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>("");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [paused3D, setPaused3D] = useState(false);
  const [loading, setLoading] = useState(false);

  // carregar catálogo
  useEffect(() => {
    (async () => {
      try {
        const j = await fetchJson<{ items: CatalogItem[] }>("/simulation/catalog");
        setCatalog(j.items || []);
      } catch (e) {
        console.error(e);
        setCatalog([]);
      }
    })();
  }, []);

  // agrupar por grp e coalescer por code
  const grouped = useMemo(() => {
    const byGrp: Record<string, { code: string; items: CatalogItem[] }[]> = {};
    const seen = new Set<string>();
    for (const it of catalog) {
      if (seen.has(it.code)) continue;
      seen.add(it.code);
      const items = catalog.filter(x => x.code === it.code);
      const grp = items[0]?.grp || "Outros";
      (byGrp[grp] ||= []).push({ code: it.code, items });
    }
    // ordenação leve
    for (const grp of Object.keys(byGrp)) {
      byGrp[grp].sort((a, b) => a.code.localeCompare(b.code));
    }
    return byGrp;
  }, [catalog]);

  // selecionar primeiro item quando chegar o catálogo
  useEffect(() => {
    const firstGrp = Object.keys(grouped)[0];
    const first = firstGrp ? grouped[firstGrp][0]?.code : "";
    if (!selectedCode && first) setSelectedCode(first);
  }, [grouped, selectedCode]);

  async function handleSimulate() {
    if (!selectedCode) return;
    setLoading(true);
    try {
      const j = await postJson<Scenario>("/simulation/draw", { mode: "by_code", code: selectedCode });
      const delay = 3000 + Math.floor(Math.random() * 2001);
      setTimeout(() => {
        if (j.ui?.halt_3d) setPaused3D(true);
        setScenario(j);
        setLoading(false);
      }, delay);
    } catch (e) {
      console.error(e);
      alert("Falha ao gerar cenário.");
      setLoading(false);
    }
  }

  const sevBadge = scenario?.error?.severity !== undefined && (
    <span
      className={`text-white text-xs px-2 py-1 rounded ${
        (scenario!.error.severity! >= 4 && "bg-red-600") ||
        (scenario!.error.severity === 3 && "bg-amber-500") ||
        "bg-emerald-600"
      }`}
    >
      Severidade {scenario!.error.severity}
    </span>
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Simulation</h1>

      <Card className="shadow-md">
        <CardContent className="p-4 space-y-4">
          <ThreeDModel {...({ paused: paused3D } as any)} />

          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium">Tipo de erro:</label>
            <select
              className="border rounded p-2 min-w-72 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value)}
            >
              {Object.entries(grouped).map(([grp, arr]) => (
                <optgroup key={grp} label={grp}>
                  {arr.map(({ code, items }) => {
                    const friendly = FRIENDLY[code] || items[0]?.name || code;
                    const tip = items.map((x) => x.label).join(" | ");
                    return (
                      <option key={code} value={code} title={tip}>
                        {friendly} ({code})
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>

            <Button onClick={handleSimulate} disabled={loading || !selectedCode}>
              {loading ? "Gerando..." : "Simular"}
            </Button>
          </div>

          {scenario && (
            <div className="mt-4 p-3 rounded border border-sky-700/40 bg-sky-900/20">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{scenario.error.name}</span>
                {sevBadge}
              </div>
              <div className="text-xs opacity-80">Causa: {scenario.cause}</div>
              <ul className="mt-2 list-disc ml-4 text-sm">
                {scenario.actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>

              <div className="flex gap-3 mt-6 justify-end">
                <Button variant="secondary" onClick={() => alert("Erro reconhecido (ACK).")}>
                  Reconhecer
                </Button>
                {scenario.resume_allowed ? (
                  <Button
                    onClick={() => {
                      setScenario(null);
                      setPaused3D(false);
                    }}
                  >
                    Retomar
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setScenario(null);
                      setPaused3D(true);
                    }}
                  >
                    Encerrar simulação
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
