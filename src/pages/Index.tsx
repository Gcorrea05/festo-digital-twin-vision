
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'react-router-dom';
import Login from '@/components/Login';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import LiveMetrics from '@/components/dashboard/LiveMetrics';
import AIClassification from '@/components/dashboard/AIClassification';
import ThreeDModel from '@/components/dashboard/ThreeDModel';

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
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
      <Header toggleSidebar={toggleSidebar} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 md:ml-64">
          <div className="container mx-auto">
            <div className="mb-6 flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
                <p className="text-muted-foreground">Welcome to the FESTO Digital Twin monitoring system</p>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-6">
              {/* Top row: LiveMetrics + AIClassification */}
              <div className="col-span-12 md:col-span-6">
                <LiveMetrics />
              </div>
              <div className="col-span-12 md:col-span-6">
                <AIClassification />
              </div>
              
              {/* 3D Model Visualization */}
              <div className="col-span-12">
                <ThreeDModel />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
