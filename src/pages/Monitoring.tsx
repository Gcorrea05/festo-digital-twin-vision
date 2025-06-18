
import React from 'react';
import Layout from '@/components/Layout';
import VideoFeed from '@/components/dashboard/VideoFeed';
import StatusOverview from '@/components/dashboard/StatusOverview';
import LiveMetrics from '@/components/dashboard/LiveMetrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Pause, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const Monitoring = () => {
  const [conveyorStatus, setConveyorStatus] = React.useState<'running' | 'paused' | 'stopped'>('running');
  const [conveyorSpeed, setConveyorSpeed] = React.useState(75);
  
  const handleConveyorToggle = () => {
    if (conveyorStatus === 'running') {
      setConveyorStatus('paused');
      toast({
        title: "Conveyor Paused",
        description: "The conveyor has been paused. Product sorting has been suspended.",
      });
    } else {
      setConveyorStatus('running');
      toast({
        title: "Conveyor Started",
        description: "The conveyor is now running. Product sorting resumed.",
      });
    }
  };
  
  const handleEmergencyStop = () => {
    setConveyorStatus('stopped');
    toast({
      title: "EMERGENCY STOP",
      description: "Emergency stop activated. All systems halted.",
      variant: "destructive",
    });
  };
  
  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const speed = parseInt(e.target.value);
    setConveyorSpeed(speed);
  };
  
  const handleRefresh = () => {
    toast({
      title: "Sensors Refreshed",
      description: "All sensor connections have been refreshed.",
    });
  };

  return (
    <Layout title="Monitoring" description="Real-time monitoring and control of the FESTO conveyor system">
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          {/* Video feed takes more space as primary monitoring tool */}
          <VideoFeed fullWidth />
        </div>
        
        <div className="col-span-12 lg:col-span-4">
          {/* Live status indicators */}
          <StatusOverview />
          
          {/* Controls card */}
          <Card className="mt-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Conveyor Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Status:</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    conveyorStatus === 'running' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                      : conveyorStatus === 'paused'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {conveyorStatus === 'running' ? 'Running' : conveyorStatus === 'paused' ? 'Paused' : 'STOPPED'}
                  </span>
                </div>
                
                <div className="flex flex-col gap-2">
                  <label htmlFor="speed" className="text-sm font-medium">
                    Speed: {conveyorSpeed}%
                  </label>
                  <input 
                    id="speed"
                    type="range" 
                    min="10" 
                    max="100" 
                    value={conveyorSpeed} 
                    onChange={handleSpeedChange}
                    disabled={conveyorStatus === 'stopped'}
                    className="w-full"
                  />
                </div>
                
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between gap-2">
                    <Button 
                      onClick={handleConveyorToggle} 
                      disabled={conveyorStatus === 'stopped'}
                      variant="outline" 
                      className="flex-1"
                    >
                      {conveyorStatus === 'running' ? (
                        <>
                          <Pause className="mr-2 h-4 w-4" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Start
                        </>
                      )}
                    </Button>
                    <Button 
                      onClick={handleRefresh}
                      variant="outline" 
                      className="flex-1"
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh
                    </Button>
                  </div>
                  <Button 
                    onClick={handleEmergencyStop} 
                    variant="destructive" 
                    className="w-full font-bold"
                  >
                    <AlertCircle className="mr-2 h-4 w-4" />
                    EMERGENCY STOP
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Live metrics */}
        <div className="col-span-12">
          <LiveMetrics />
        </div>
      </div>
    </Layout>
  );
};

export default Monitoring;
