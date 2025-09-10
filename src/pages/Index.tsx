import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'react-router-dom';
import Login from '@/components/Login';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import LiveMetrics from '@/components/dashboard/LiveMetrics';
// import AIClassification from '@/components/dashboard/AIClassification';
import ThreeDModel from '@/components/dashboard/ThreeDModel';

import { LiveProvider } from '@/context/LiveContext';
import { ActuatorSelectionProvider } from '@/context/ActuatorSelectionContext';

const Index = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin mb-4"></div>
          <h2 className="text-xl font-medium">Loading...</h2>
          <p className="text-muted-foreground">Setting up the FESTO Digital Twin</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 overflow-x-hidden">
      <Header toggleSidebar={toggleSidebar} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Providers adicionados sem alterar layout/markup interno */}
        <LiveProvider>
          <ActuatorSelectionProvider>
            <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 md:ml-64">
              <div className="container mx-auto px-3 sm:px-4">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold mb-1">Dashboard</h1>
                    <p className="text-sm md:text-base text-muted-foreground">
                      Welcome to the FESTO Digital Twin monitoring system
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
                  {/* Top row: LiveMetrics + (opcional) AIClassification */}
                  <div className="lg:col-span-6">
                    <LiveMetrics />
                  </div>
                  {/* 
                  <div className="lg:col-span-6">
                    <AIClassification />
                  </div> 
                  */}

                  {/* 3D Model Visualization */}
                  <div className="lg:col-span-12">
                    <ThreeDModel />
                  </div>
                </div>
              </div>
            </main>
          </ActuatorSelectionProvider>
        </LiveProvider>
      </div>
    </div>
  );
};

export default Index;
