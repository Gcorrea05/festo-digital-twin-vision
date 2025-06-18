import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ConveyorControls from '@/components/controls/ConveyorControls';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { AlertCircle, Power, RefreshCw } from 'lucide-react';

const Controls = () => {
  const { isAuthenticated, isLoading, hasPermission } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isOperator = hasPermission('operator');

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleEmergencyStop = () => {
    toast({
      variant: 'destructive',
      title: 'Emergency Stop Activated',
      description: 'All systems have been shutdown. Please check the physical system.'
    });
  };

  const handleSystemReboot = () => {
    toast({
      title: 'System Reboot Initiated',
      description: 'The system will restart in 30 seconds.'
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
      <Header toggleSidebar={toggleSidebar} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 md:ml-64">
          <div className="container mx-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-bold mb-2">System Controls</h1>
              <p className="text-muted-foreground">Remote control and system configuration</p>
            </div>

            {!isOperator ? (
              <div className="rounded-lg border bg-card p-8 text-center">
                <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
                <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
                <p className="text-muted-foreground mb-6">
                  You don't have permission to access the control system. Only operators and administrators can control the machinery.
                </p>
                <p className="text-sm">
                  Please contact your system administrator for access.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-12 gap-6">
                  {/* Quick Actions */}
                  <Card className="col-span-12">
                    <CardHeader>
                      <CardTitle>Quick Actions</CardTitle>
                      <CardDescription>Common system operations</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-4">
                      <Button
                        size="lg"
                        variant="destructive"
                        className="flex-1"
                        onClick={handleEmergencyStop}
                      >
                        <Power className="mr-2 h-5 w-5" />
                        Emergency Stop
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="flex-1"
                        onClick={handleSystemReboot}
                      >
                        <RefreshCw className="mr-2 h-5 w-5" />
                        Reboot System
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Conveyor Controls with fixed speed placeholder */}
                  <Card className="col-span-12">
                    <CardHeader>
                      <CardTitle>Conveyor Controls</CardTitle>
                      <CardDescription>Remotely operate the conveyor belt system</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ConveyorControls />
                      <div className="mt-4">
                        <p className="text-sm text-muted-foreground">
                          Current Speed: Placeholder (waiting for system data)
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Controls;
