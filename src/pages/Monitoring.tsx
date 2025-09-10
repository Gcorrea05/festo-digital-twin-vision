import React from 'react';
import Layout from '@/components/Layout';
import LiveMetrics from '@/components/dashboard/LiveMetrics';
import SystemStatusPanel from '@/components/monitoring/SystemStatusPanel';

const Monitoring: React.FC = () => {
  return (
    <Layout
      title="Monitoring"
      description="Welcome to the IoTech Digitwin monitoring system"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* System Status à esquerda em telas grandes */}
        <div className="lg:col-span-4">
          <SystemStatusPanel />
        </div>

        {/* KPIs reais à direita (ou abaixo no mobile) */}
        <div className="lg:col-span-8">
          <LiveMetrics />
        </div>

        {/* Se quiser o 3D aqui depois, podemos adicionar abaixo */}
      </div>
    </Layout>
  );
};

export default Monitoring;
