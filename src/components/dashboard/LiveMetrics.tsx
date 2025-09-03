"use client";
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLiveMetrics } from "@/lib/api";

interface Metrics {
  temperature: number;
  vibration: number;
  speed: number;
  processedItems: number;
}

const LiveMetrics: React.FC = () => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    // Função para buscar dados periodicamente
    const fetchMetrics = async () => {
      try {
        const data = await getLiveMetrics();
        setMetrics(data);
      } catch (err) {
        console.error("Erro ao carregar métricas:", err);
      }
    };

    fetchMetrics(); // primeira chamada
    const interval = setInterval(fetchMetrics, 5000); // atualiza a cada 5s
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="col-span-full md:col-span-8 lg:col-span-6">
      <CardHeader className="pb-2">
        <CardTitle>Live Metrics</CardTitle>
        <CardDescription>Real-time sensor data from the conveyor system</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-white dark:bg-gray-900 rounded-xl shadow">
            <h3 className="font-bold">Temperature</h3>
            <p>{metrics ? `${metrics.temperature} °C` : "Carregando..."}</p>
          </div>
          <div className="p-4 bg-white dark:bg-gray-900 rounded-xl shadow">
            <h3 className="font-bold">Vibration</h3>
            <p>{metrics ? `${metrics.vibration} Hz` : "Carregando..."}</p>
          </div>
          <div className="p-4 bg-white dark:bg-gray-900 rounded-xl shadow">
            <h3 className="font-bold">Speed</h3>
            <p>{metrics ? `${metrics.speed} m/s` : "Carregando..."}</p>
          </div>
          <div className="p-4 bg-white dark:bg-gray-900 rounded-xl shadow">
            <h3 className="font-bold">Processed Items</h3>
            <p>{metrics ? metrics.processedItems : "Carregando..."}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveMetrics;
