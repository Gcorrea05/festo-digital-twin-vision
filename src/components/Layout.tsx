
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Login from '@/components/Login';

interface LayoutProps {
  children: React.ReactNode;
  title: string;
  description: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title, description }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  
  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);
  
  // If loading, show a loading spinner
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
  
  // If not authenticated, show login page
  if (!isAuthenticated) {
    return <Login />;
  }

  // Toggle sidebar
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
            <div className="mb-6">
              <h1 className="text-2xl font-bold mb-2">{title}</h1>
              <p className="text-muted-foreground">{description}</p>
            </div>
            
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
