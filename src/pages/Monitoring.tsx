import React, { useState } from "react";
import SystemStatusPanel from "@/components/monitoring/SystemStatusPanel";
import LiveMetricsMon from "@/components/monitoring/LiveMetricsMon";

const Monitoring: React.FC = () => {
  const [model, setModel] = useState<1 | 2>(1);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-8 pb-12">
        <header className="mb-6">
          <h1>Monitoring</h1>
          <p className="page-subtitle">
            Detailed view of actuators, sensors and system components in real time.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Coluna esquerda: System Status (altura total) */}
          <div className="lg:col-span-4 [&>*]:h-full">
            <SystemStatusPanel />
          </div>

          {/* Coluna direita: Métricas do modelo ativo (tabs estilo foto) */}
          <div className="lg:col-span-8 space-y-4">
            {/* Tabs */}
            <div className="inline-flex rounded-2xl bg-black/30 p-1 border border-white/10">
              <button
                onClick={() => setModel(1)}
                className={`px-4 py-2 text-base rounded-xl transition ${
                  model === 1
                    ? "bg-cyan-600 text-white"
                    : "bg-transparent text-white/80 hover:text-white"
                }`}
              >
                Atuador 1
              </button>
              <button
                onClick={() => setModel(2)}
                className={`px-4 py-2 text-base rounded-xl transition ${
                  model === 2
                    ? "bg-cyan-600 text-white"
                    : "bg-transparent text-white/80 hover:text-white"
                }`}
              >
                Atuador 2
              </button>
            </div>

            {/* Painel de métricas do atuador selecionado */}
            <section>
              <LiveMetricsMon selectedId={model} />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Monitoring;