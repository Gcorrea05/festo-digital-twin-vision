import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const LiveMetrics: React.FC = () => {
  return (
    <Card className="col-span-full md:col-span-8 lg:col-span-6">
      <CardHeader className="pb-2">
        <CardTitle>Live Metrics</CardTitle>
        <CardDescription>Real-time sensor data from the conveyor system</CardDescription>
      </CardHeader>
      <CardContent>
        <ul>
          <li>Detecção : <span className="text-gray-500">Placeholder</span></li>
          <li>Temperatura : <span className="text-gray-500">Placeholder</span></li>
          <li>Velocidade : <span className="text-gray-500">Placeholder</span></li>
        </ul>
      </CardContent>
    </Card>
  );
};

export default LiveMetrics;
