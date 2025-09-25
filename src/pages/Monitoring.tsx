// src/pages/Monitoring.tsx
import React from "react";
import SystemStatusPanel from "@/components/monitoring/SystemStatusPanel";
import LiveMetricsMon from "@/components/monitoring/LiveMetricsMon";

const Monitoring: React.FC = () => {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-8 pb-12">
        <header className="mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">
            Monitoring
          </h1>
          <p className="mt-1 text-sm md:text-base text-muted-foreground">
            Detailed view of actuators, sensors and system components in real time.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Painel de status do sistema (coluna esquerda, altura 100%) */}
          <div className="lg:col-span-4 [&>*]:h-full">
            <SystemStatusPanel />
          </div>

          {/* Painel de métricas A1 e A2 lado a lado */}
          <div className="lg:col-span-8 space-y-8">
            <section>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                Atuador A1
              </h3>
              <LiveMetricsMon selectedId={1} />
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                Atuador A2
              </h3>
              <LiveMetricsMon selectedId={2} />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Monitoring;
