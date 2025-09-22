// src/pages/Monitoring.tsx
import React, { useState } from 'react';
import SystemStatusPanel from '@/components/monitoring/SystemStatusPanel';
import LiveMetricsMon from '@/components/monitoring/LiveMetricsMon';

const Monitoring: React.FC = () => {
  // seleção local do atuador (1 ou 2)
  const [selected, setSelected] = useState<1 | 2>(1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Painel de status do sistema à esquerda */}
      <div className="lg:col-span-4 space-y-4">
        {/* Seleção de atuador */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Atuador:</span>
          <div className="inline-flex rounded-xl p-1 bg-muted">
            <button
              type="button"
              onClick={() => setSelected(1)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                selected === 1 ? 'bg-background shadow' : 'opacity-70 hover:opacity-100'
              }`}
            >
              A1
            </button>
            <button
              type="button"
              onClick={() => setSelected(2)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                selected === 2 ? 'bg-background shadow' : 'opacity-70 hover:opacity-100'
              }`}
            >
              A2
            </button>
          </div>
        </div>

        <SystemStatusPanel />
      </div>

      {/* KPIs exclusivos da aba Monitoring à direita */}
      <div className="lg:col-span-8">
        {/* Passamos o selecionado para os KPIs */}
        <LiveMetricsMon selectedId={selected} />
      </div>

      {/* (opcional) espaço para 3D ou gráficos adicionais */}
    </div>
  );
};

export default Monitoring;
