// src/pages/Index.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'react-router-dom';
import Login from '@/components/Login';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import LiveMetrics  from '@/components/dashboard/LiveMetrics';
// import AIClassification from '@/components/dashboard/AIClassification';
import ThreeDModel from '@/components/dashboard/ThreeDModel';

import { LiveProvider } from '@/context/LiveContext';
import { ActuatorSelectionProvider } from '@/context/ActuatorSelectionContext';

const Index = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setSidebarOpen(false); }, [location]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin mb-4"></div>
          <h2 className="text-xl font-medium">Loading...</h2>
          <p className="text-muted-foreground">Setting up the IoTech Digitwin</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Login />;

  const toggleSidebar = () => setSidebarOpen((v) => !v);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 overflow-x-hidden">
      <Header toggleSidebar={toggleSidebar} />

      <div className="flex flex-1">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* ⚠️ Removido lg:pl-64 para evitar deslocamento extra no desktop */}
        <LiveProvider>
          <ActuatorSelectionProvider>
            <main className="flex-1 pt-16 overflow-y-auto">
              <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-8 pb-12">
                <header className="mb-6">
                  <h1 className="text-3xl md:text-4xl font-extrabold leading-tight text-slate-100">
                    Dashboard
                  </h1>
                  <p className="mt-1 text-sm md:text-base text-muted-foreground">
                    Welcome to the IoTech Digitwin monitoring system
                  </p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
                  <div className="lg:col-span-6">
                    <LiveMetrics />
                  </div>
                  {/* <div className="lg:col-span-6"><AIClassification /></div> */}
                  <div className="lg:col-span-12">
                    <ThreeDModel />
                  </div>
                </div>
              </div>
            </main>
          </ActuatorSelectionProvider>
        </LiveProvider>
      </div>

      {/* Footer colado à esquerda */}
      <footer className="border-t border-white/5 bg-slate-900/40 text-xs text-slate-400 pt-4 pb-6">
        <div className="mx-auto max-w-screen-2xl px-6 md:px-8 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <span>System Online</span>
          <span className="opacity-50">•</span>
          <span>IoTech Digitwin v1.0.0</span>
          <span className="opacity-50">•</span>
          <span>© 2025 IoTech Corporation</span>
        </div>
      </footer>
    </div>
  );
};

export default Index;
