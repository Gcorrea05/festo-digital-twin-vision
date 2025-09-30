// src/pages/Simulation/Simulation.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ThreeDModel from "@/components/dashboard/ThreeDModel";

type CatalogItem = { id:number; code:string; name:string; grp:string; label:string; severity?:number };
type Scenario = {
  scenario_id:string; actuator:1|2;
  error:{ id:number; code:string; name:string; grp:string; severity?:number };
  cause:string; actions:string[]; params:Record<string,any>;
  ui:{ halt_sim:boolean; halt_3d:boolean; show_popup:boolean }; resume_allowed:boolean;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

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
  const [scenario, setScenario] = useState<Scenario|null>(null);
  const [paused3D, setPaused3D] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { (async () => {
    try {
      const r = await fetch(`${API_BASE}/simulation/catalog`, { credentials: "include" });
      const j = await r.json(); setCatalog(j.items || []);
    } catch(e){ console.error(e); }
  })(); }, []);

  const grouped = useMemo(() => {
    const byGrp: Record<string, {code:string; items:CatalogItem[]}[]> = {};
    const seen = new Set<string>();
    for (const it of catalog) {
      if (seen.has(it.code)) continue;
      seen.add(it.code);
      const items = catalog.filter(x => x.code === it.code);
      (byGrp[it.grp || "OUTROS"] ||= []).push({ code: it.code, items });
    }
    Object.values(byGrp).forEach(arr => arr.sort((a,b)=>a.code.localeCompare(b.code)));
    return byGrp;
  }, [catalog]);

  useEffect(() => {
    if (!selectedCode) {
      const firstGrp = Object.keys(grouped)[0];
      const first = firstGrp ? grouped[firstGrp][0]?.code : "";
      if (first) setSelectedCode(first);
    }
  }, [grouped, selectedCode]);

  async function handleSimulate() {
    if (!selectedCode) return; setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/simulation/draw`, {
        method:"POST", headers:{ "Content-Type":"application/json" }, credentials:"include",
        body: JSON.stringify({ mode:"by_code", code: selectedCode }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j: Scenario = await r.json();
      const delay = 3000 + Math.floor(Math.random()*2001);
      setTimeout(() => { if (j.ui?.halt_3d) setPaused3D(true); setScenario(j); setLoading(false); }, delay);
    } catch(e){ console.error(e); alert("Falha ao gerar cenário."); setLoading(false); }
  }

  const sevBadge = scenario?.error?.severity !== undefined && (
    <span className={`text-white text-xs px-2 py-1 rounded ${
      (scenario!.error.severity!>=4&&"bg-red-600")||(scenario!.error.severity===3&&"bg-amber-500")||"bg-emerald-600"
    }`}>Severidade {scenario!.error.severity}</span>
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
              className="border rounded p-2 min-w-72 text-base bg-white dark:bg-neutral-900 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              value={selectedCode}
              onChange={(e)=>setSelectedCode(e.target.value)}
            >
              {Object.entries(grouped).map(([grp, arr]) => (
                <optgroup key={grp} label={grp}>
                  {arr.map(({code, items}) => {
                    const friendly = FRIENDLY[code] || items[0]?.name || code;
                    const tip = items.map(x=>x.label).join(" | ");
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
          {loading && <p className="text-sm opacity-70">Injetando falha… aguarde alguns segundos.</p>}
        </CardContent>
      </Card>

      {scenario && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl p-6 w-full max-w-xl">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold">
                {scenario.error.code} — {FRIENDLY[scenario.error.code]||scenario.error.name}
              </h2>
              {sevBadge}
            </div>
            <p className="text-sm opacity-80 mb-1">Atuador: A{scenario.actuator}</p>
            <p className="font-medium mt-2">Por que aconteceu</p>
            <p className="opacity-90">{scenario.cause}</p>
            <p className="font-medium mt-3">O que fazer</p>
            <ul className="list-disc ml-5 mt-1">{scenario.actions.map((a,i)=><li key={i}>{a}</li>)}</ul>
            {!!Object.keys(scenario.params||{}).length && (
              <>
                <p className="font-medium mt-3">Parâmetros</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.entries(scenario.params).map(([k,v])=>(
                    <span key={k} className="text-xs border rounded px-2 py-1">{k}: {String(v)}</span>
                  ))}
                </div>
              </>
            )}
            <div className="flex gap-3 mt-6 justify-end">
              <Button variant="secondary" onClick={()=>alert("Erro reconhecido (ACK).")}>Reconhecer</Button>
              {scenario.resume_allowed ? (
                <Button onClick={()=>{ setScenario(null); setPaused3D(false); }}>Retomar</Button>
              ) : (
                <Button onClick={()=>{ setScenario(null); setPaused3D(true); }}>Encerrar simulação</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
