// src/components/dashboard/LiveMetrics.tsx
import React from "react";
import { useLive } from "@/context/LiveContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const LiveMetrics: React.FC = () => {
  const { snapshot } = useLive();

  if (!snapshot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Live Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Aguardando dados do backend...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Metrics</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Status do sistema */}
        <div>
          <p className="text-sm text-muted-foreground">System</p>
          <p className="text-lg font-bold">
            {snapshot.system.status.toUpperCase()}
          </p>
        </div>

        {/* CPM total */}
        <div>
          <p className="text-sm text-muted-foreground">Total CPM</p>
          <p className="text-lg font-bold">
            {snapshot.actuators.reduce((acc, a) => acc + (a.cpm || 0), 0)}
          </p>
        </div>

        {/* Atuadores */}
        <div className="sm:col-span-3">
          <p className="text-sm text-muted-foreground">Actuators</p>
          <ul className="text-sm space-y-1">
            {snapshot.actuators.map((a) => (
              <li key={a.id}>
                AT{a.id}: {a.facets.S2 ? "AVANÇADO" : a.facets.S1 ? "RECUADO" : "TRANSIÇÃO"} —{" "}
                {a.cpm} CPM
              </li>
            ))}
          </ul>
        </div>

        {/* MPU opcional */}
        {snapshot.mpu && (
          <div className="sm:col-span-3">
            <p className="text-sm text-muted-foreground">MPU</p>
            <p className="text-xs">
              ax: {snapshot.mpu.ax.toFixed(2)} | ay: {snapshot.mpu.ay.toFixed(2)} | az:{" "}
              {snapshot.mpu.az.toFixed(2)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LiveMetrics;
