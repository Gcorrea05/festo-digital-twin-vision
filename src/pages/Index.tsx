// src/pages/Index.tsx — Dashboard enxuto (apenas Live Metrics + 3D)
import React from "react";
import { useAuth } from "@/context/AuthContext";
import Login from "@/components/Login";

// Mantemos só estes dois blocos na Dashboard
import LiveMetrics from "@/components/dashboard/LiveMetrics";
import ThreeDModel from "@/components/dashboard/ThreeDModel";

const Index: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-8 py-12">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-8 pb-12">
        <header className="mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">Dashboard</h1>
          <p className="text-muted-foreground">Visão resumida em tempo real e visual 3D.</p>
        </header>

        <div className="grid grid-cols-1 gap-6">
          {/* Live Metrics */}
          <section>
            <LiveMetrics />
          </section>

          {/* Visual 3D */}
          <section>
            <ThreeDModel />
          </section>
        </div>
      </div>
    </main>
  );
};

export default Index;
