"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Metrics {
  temperature: number;
  vibration: number;
  speed: number;
  processedItems: number;
}

export default function LiveMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    // Abre conexão WebSocket com o backend
    const ws = new WebSocket("ws://localhost:8000/ws/mpu?id=MPUA1");

    ws.onopen = () => {
      console.log("✅ Conectado ao WebSocket");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "mpu_sample") {
        // Aqui você pode mapear os dados do sensor como quiser
        setMetrics({
          temperature: data.temp_c,
          vibration: Math.sqrt(data.gx_dps ** 2 + data.gy_dps ** 2 + data.gz_dps ** 2), // exemplo
          speed: Math.sqrt(data.ax_g ** 2 + data.ay_g ** 2 + data.az_g ** 2), // exemplo
          processedItems: 0 // -> precisa definir como calcular
        });
      }
    };

    ws.onerror = (err) => {
      console.error("❌ Erro no WebSocket:", err);
    };

    ws.onclose = () => {
      console.warn("⚠️ WebSocket fechado");
    };

    // Fecha o WS quando o componente desmontar
    return () => ws.close();
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
            <p>{metrics ? `${metrics.temperature.toFixed(2)} °C` : "Aguardando..."}</p>
          </div>
          <div className="p-4 bg-white dark:bg-gray-900 rounded-xl shadow">
            <h3 className="font-bold">Vibration</h3>
            <p>{metrics ? `${metrics.vibration.toFixed(2)} Hz` : "Aguardando..."}</p>
          </div>
          <div className="p-4 bg-white dark:bg-gray-900 rounded-xl shadow">
            <h3 className="font-bold">Speed</h3>
            <p>{metrics ? `${metrics.speed.toFixed(2)} m/s` : "Aguardando..."}</p>
          </div>
          <div className="p-4 bg-white dark:bg-gray-900 rounded-xl shadow">
            <h3 className="font-bold">Processed Items</h3>
            <p>{metrics ? metrics.processedItems : "Aguardando..."}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
