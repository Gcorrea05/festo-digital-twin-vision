import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';
import { Play, Pause, Power, RefreshCw } from 'lucide-react';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const ConveyorControls: React.FC = () => {
  const { hasPermission } = useAuth();
  
  const isOperator = hasPermission('operator');
  
  const [isRunning, setIsRunning] = useState(true);
  const [sorterEnabled, setSorterEnabled] = useState(true);
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'start' | 'stop' | null>(null);
  
  const handleSorterToggle = (enabled: boolean) => {
    if (!isOperator) return;
    
    setSorterEnabled(enabled);
    toast({
      title: enabled ? 'Sorter Enabled' : 'Sorter Disabled',
      description: enabled 
        ? 'Auto-sorting system is now active' 
        : 'Auto-sorting system has been disabled'
    });
  };
  
  const initiateStartStop = (action: 'start' | 'stop') => {
    if (!isOperator) return;
    
    setPendingAction(action);
    setConfirmationDialogOpen(true);
  };
  
  const confirmStartStop = () => {
    if (pendingAction === 'start') {
      setIsRunning(true);
      toast({
        title: 'Conveyor Started',
        description: 'The conveyor belt has been started successfully.'
      });
    } else if (pendingAction === 'stop') {
      setIsRunning(false);
      toast({
        title: 'Conveyor Stopped',
        description: 'The conveyor belt has been stopped safely.'
      });
    }
    
    setConfirmationDialogOpen(false);
    setPendingAction(null);
  };
  
  const resetSystem = () => {
    if (!isOperator) return;
    
    toast({
      title: 'System Reset',
      description: 'The system has been reset to default settings.'
    });
    
    // Simulate a system reset
    setSorterEnabled(true);
  };
  
  return (
    <Card className="col-span-12 md:col-span-6">
      <CardHeader>
        <CardTitle>Conveyor Controls</CardTitle>
        <CardDescription>Remotely operate the conveyor belt system</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">Main Power</h3>
            <p className="text-sm text-muted-foreground mb-2">Current state: {isRunning ? 'Running' : 'Stopped'}</p>
            <div className="flex items-center space-x-2">
              <Button
                variant={isRunning ? "outline" : "default"}
                disabled={isRunning || !isOperator}
                onClick={() => initiateStartStop('start')}
              >
                <Play className="mr-2 h-4 w-4" />
                Start
              </Button>
              <Button
                variant={!isRunning ? "outline" : "destructive"}
                disabled={!isRunning || !isOperator}
                onClick={() => initiateStartStop('stop')}
              >
                <Pause className="mr-2 h-4 w-4" />
                Stop
              </Button>
            </div>
          </div>
          
          <div className={`h-24 w-24 rounded-full flex items-center justify-center border-8 ${
            isRunning 
              ? 'border-green-500 border-t-transparent animate-spin-slow' 
              : 'border-gray-300'
          }`}>
            <Power className={`h-10 w-10 ${isRunning ? 'text-green-500' : 'text-gray-400'}`} />
          </div>
        </div>
        
        <div className="pt-4 border-t">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-medium">Auto-Sorter</h3>
              <p className="text-sm text-muted-foreground">Automatic defect removal</p>
            </div>
            <Switch
              checked={sorterEnabled}
              onCheckedChange={handleSorterToggle}
              disabled={!isOperator}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t pt-4 flex justify-between">
        <div className="text-sm text-muted-foreground">
          {!isOperator && (
            <p className="text-amber-500 dark:text-amber-400">
              You need operator permissions to control the system
            </p>
          )}
          {isOperator && (
            <p>You have full control access</p>
          )}
        </div>
        
        <Button 
          variant="outline" 
          disabled={!isOperator}
          onClick={resetSystem}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Reset
        </Button>
      </CardFooter>
      
      {/* Confirmation Dialog */}
      <Dialog open={confirmationDialogOpen} onOpenChange={setConfirmationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
            <DialogDescription>
              {pendingAction === 'start' 
                ? 'Are you sure you want to start the conveyor belt system?'
                : 'Are you sure you want to stop the conveyor belt system?'
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setConfirmationDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              variant={pendingAction === 'stop' ? 'destructive' : 'default'}
              onClick={confirmStartStop}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ConveyorControls;
