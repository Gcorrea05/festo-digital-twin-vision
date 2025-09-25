// src/pages/Index.tsx
import React from "react";
import { useAuth } from "@/context/AuthContext";
import Login from "@/components/Login";

import StatusOverview from "@/components/dashboard/StatusOverview";
import LiveMetrics from "@/components/dashboard/LiveMetrics";
import ProductionStats from "@/components/dashboard/ProductionStats";
import AlertsList from "@/components/dashboard/AlertsList";
import ThreeDModel from "@/components/dashboard/ThreeDModel";

const Index: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin mb-4" />
          <h2 className="text-xl font-medium">Loading...</h2>
          <p className="text-muted-foreground">Setting up the IoTech Digitwin</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Login />;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-8 pb-12">
        <header className="mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">
            Dashboard
          </h1>
          <p className="mt-1 text-sm md:text-base text-muted-foreground">
            Welcome to the IoTech Digitwin monitoring system
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          {/* Status geral (derivado do LiveContext) */}
          <div className="lg:col-span-12">
            <StatusOverview />
          </div>

          {/* Live metrics + Alertas recentes */}
          <div className="lg:col-span-6">
            <LiveMetrics />
          </div>
          <div className="lg:col-span-6">
            <AlertsList />
          </div>

          {/* Estatísticas de produção (OPC S1/S2) */}
          <div className="lg:col-span-12">
            <ProductionStats />
          </div>

          {/* Visual 3D / Live camera no mesmo card */}
          <div className="lg:col-span-12">
            <ThreeDModel />
          </div>
        </div>
      </div>
    </main>
  );
};

export default Index;
