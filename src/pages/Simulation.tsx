// src/pages/Simulation.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ThreeDModel from "@/components/dashboard/ThreeDModel";
import { fetchJson, postJson } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CatalogItem = {
  id: number;
  code: string;
  name: string;
  grp: string;
  label: string;
  severity?: number;
};

type Scenario = {
  scenario_id: string;
  actuator: 1 | 2;
  error: { id: number; code: string; name: string; grp: string; severity?: number };
  cause: string;
  actions: string[];
  params: Record<string, any>;
  ui: { halt_sim: boolean; halt_3d: boolean; show_popup: boolean };
  resume_allowed: boolean;
};

const FRIENDLY: Record<string, string> = {
  VIB_HIGH: "Vibração elevada",
  IMU_SAT: "IMU saturado",
  IMU_STUCK: "Sinal preso/deriva",
  CYCLE_SLOW: "Ciclo lento",
  STATE_STUCK: "Atuador não muda ao comando",
  NO_SAMPLES: "Sem telemetria recente",
};

// atraso aleatório 3–5s — usa Promise para garantir espera real
function delay3to5s() {
  const ms = 3000 + Math.floor(Math.random() * 2001);
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export default function Simulation() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>("");
  const [scenario, setScenario] = useState<Scenario | null>(null);

  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [paused3D, setPaused3D] = useState(true); // começa pausado
  const [openDlg, setOpenDlg] = useState(false);

  // RESET do 3D via remount controlado por key
  const [modelKey, setModelKey] = useState(0);

  // evita setState após unmount
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // ---- catálogo
  const loadCatalog = async () => {
    try {
      setCatLoading(true);
      setCatError(null);
      const j = await fetchJson<{ items: CatalogItem[] }>("/api/simulation/catalog");
      if (!alive.current) return;
      setCatalog(Array.isArray(j?.items) ? j.items : []);
    } catch (e: any) {
      if (!alive.current) return;
      setCatError(e?.message ?? "Falha ao carregar catálogo");
      setCatalog([]);
    } finally {
      if (alive.current) setCatLoading(false);
    }
  };
  useEffect(() => {
    void loadCatalog();
  }, []);

  // seleção inicial
  useEffect(() => {
    if (!selectedCode && catalog.length) setSelectedCode(catalog[0].code);
  }, [catalog, selectedCode]);

  // agrupado só p/ organização visual
  const grouped = useMemo(() => {
    const map: Record<string, { code: string; items: CatalogItem[] }[]> = {};
    const byCode = catalog.reduce<Record<string, CatalogItem[]>>((acc, it) => {
      (acc[it.code] ||= []).push(it);
      return acc;
    }, {});
    for (const [code, items] of Object.entries(byCode)) {
      const grp = items[0]?.grp || "Outros";
      (map[grp] ||= []).push({ code, items });
    }
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.code.localeCompare(b.code)));
    return map;
  }, [catalog]);

  // ---- simular: anima já; pop-up só após resposta + atraso 3–5s
  async function handleSimulate() {
    if (!selectedCode) return;
    setScenario(null);
    setOpenDlg(false);
    setPaused3D(false); // começa animado imediatamente (play)
    setLoading(true);

    try {
      const req = postJson<Scenario>("/api/simulation/draw", { mode: "by_code", code: selectedCode });
      const wait = delay3to5s();
      const j = await req;       // aguarda backend
      await wait;                // garante o atraso

      if (!alive.current) return;

      setScenario(j);

      if (j?.ui?.show_popup !== false) {
        setOpenDlg(true);
        setPaused3D(true);       // pausa junto com o pop-up
      } else if (j?.ui?.halt_3d) {
        setPaused3D(true);
      }
    } catch (e) {
      console.error(e);
      if (alive.current) alert("Falha ao gerar cenário.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }

  const sevBadge =
    scenario?.error?.severity != null && (
      <span
        className={`text-white text-sm md:text-base px-2.5 py-1 rounded ${
          (scenario!.error.severity! >= 4 && "bg-red-600") ||
          (scenario!.error.severity === 3 && "bg-amber-500") ||
          "bg-emerald-600"
        }`}
      >
        Sev {scenario!.error.severity}
      </span>
    );

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-8 pb-12">
        {/* Título + Subtítulo padronizados */}
        <header className="mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">Simulation</h1>
          <p className="text-muted-foreground">Execute cenários de falha e visualize o efeito no modelo 3D.</p>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Modelo</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* RESET controlado pela key */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <ThreeDModel key={modelKey} paused={paused3D} />
            </div>

            {/* Linha de seleção + ação */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="text-lg md:text-xl font-semibold tracking-wide text-slate-100">
                Tipo de erro:
              </label>

              <div className="flex flex-col">
                <select
                  className={[
                    "rounded-xl px-4 py-2.5 text-lg min-w-80",
                    "bg-slate-800 text-slate-100 placeholder-slate-400",
                    "border border-sky-500/80 shadow focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400",
                    "[color-scheme:dark]",
                  ].join(" ")}
                  value={selectedCode}
                  onChange={(e) => {
                    setSelectedCode(e.target.value);
                    setScenario(null);
                    setPaused3D(true);           // volta pausado
                    setModelKey((k) => k + 1);   // RESET: retorna à pose inicial
                  }}
                >
                  <option value="" disabled>
                    {catLoading
                      ? "Carregando cenários..."
                      : catError
                      ? "Falha ao carregar"
                      : "Selecione um cenário"}
                  </option>

                  {Object.entries(grouped).map(([grp, entries]) => (
                    <optgroup key={grp} label={grp}>
                      {entries.map(({ code, items }) => (
                        <option key={code} value={code} title={items.map((x) => x.label).join(" | ")}>
                          {(FRIENDLY[code] || items[0]?.name || code)} ({code})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {catError && (
                  <div className="mt-1 text-base text-amber-300">
                    Falha ao carregar do servidor.{" "}
                    <button className="underline" onClick={() => void loadCatalog()}>
                      Tentar novamente
                    </button>
                  </div>
                )}
              </div>

              <Button
                className="px-5 py-2.5 text-lg rounded-xl"
                onClick={handleSimulate}
                disabled={loading || !selectedCode}
              >
                {loading ? "Gerando..." : "Simular"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* POP-UP padronizado */}
        <Dialog
          open={openDlg}
          onOpenChange={(open) => {
            setOpenDlg(open);
            if (!open) {
              setPaused3D(true);
            }
          }}
        >
          <DialogContent className="sm:max-w-lg bg-slate-900 text-slate-100 border border-slate-700">
            {scenario && (
              <>
                <DialogHeader className="space-y-1">
                  <DialogTitle className="flex items-center gap-2 text-xl md:text-2xl">
                    {scenario.error.name}
                    {sevBadge}
                  </DialogTitle>
                  <DialogDescription className="text-slate-300 text-base">
                    Causa: {scenario.cause}
                  </DialogDescription>
                </DialogHeader>

                <div className="pt-1">
                  <div className="text-base font-semibold mb-2">Ações sugeridas:</div>
                  <ul className="list-disc ml-4 space-y-1 text-base">
                    {scenario.actions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-3 mt-6 justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPaused3D(true);
                      setOpenDlg(false);
                      setScenario(null);
                      setModelKey((k) => k + 1); // RESET
                      alert("Erro reconhecido (ACK).");
                    }}
                  >
                    Reconhecer
                  </Button>

                  {scenario.resume_allowed ? (
                    <Button
                      onClick={() => {
                        setScenario(null);
                        setPaused3D(true);
                        setOpenDlg(false);
                        setModelKey((k) => k + 1); // RESET
                      }}
                    >
                      Retomar
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setScenario(null);
                        setPaused3D(true);
                        setOpenDlg(false);
                        setModelKey((k) => k + 1); // RESET
                      }}
                    >
                      Encerrar simulação
                    </Button>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
