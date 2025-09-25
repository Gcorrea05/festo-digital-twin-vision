// src/pages/Monitoring.tsx  (1/1)
import React from 'react';
import SystemStatusPanel from '@/components/monitoring/SystemStatusPanel';
import LiveMetricsMon from '@/components/monitoring/LiveMetricsMon';

const Monitoring: React.FC = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Coluna esquerda (esticada) */}
      <div className="lg:col-span-4 [&>*]:h-full">
        <SystemStatusPanel />
      </div>

      {/* Coluna direita: A1 + A2 */}
      <div className="lg:col-span-8 space-y-8">
        <section>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Atuador A1</h3>
          <LiveMetricsMon selectedId={1} />
        </section>
        <section>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Atuador A2</h3>
          <LiveMetricsMon selectedId={2} />
        </section>
      </div>
    </div>
  );
};

export default Monitoring;
