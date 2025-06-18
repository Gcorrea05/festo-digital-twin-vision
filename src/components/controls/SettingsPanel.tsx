
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';
import { Save, RefreshCw } from 'lucide-react';

const SettingsPanel: React.FC = () => {
  const { hasPermission } = useAuth();
  const isOperator = hasPermission('operator');
  const isAdmin = hasPermission('administrator');
  
  // General settings
  const [cameraResolution, setCameraResolution] = useState('1080p');
  const [frameRate, setFrameRate] = useState(30);
  
  // Classification settings
  const [confidenceThreshold, setConfidenceThreshold] = useState(75);
  const [autoMode, setAutoMode] = useState(true);
  
  // Alert thresholds
  const [tempHighThreshold, setTempHighThreshold] = useState(32);
  const [tempLowThreshold, setTempLowThreshold] = useState(15);
  
  // Maintenance settings
  const [maintenanceInterval, setMaintenanceInterval] = useState(30);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  
  const handleSaveSettings = () => {
    toast({
      title: "Settings Saved",
      description: "Your system settings have been updated successfully."
    });
  };
  
  const handleResetSettings = () => {
    setCameraResolution('1080p');
    setFrameRate(30);
    setConfidenceThreshold(75);
    setAutoMode(true);
    setTempHighThreshold(32);
    setTempLowThreshold(15);
    setMaintenanceInterval(30);
    setNotificationsEnabled(true);
    
    toast({
      title: "Settings Reset",
      description: "All settings have been reset to default values."
    });
  };

  return (
    <Card className="col-span-12 md:col-span-6">
      <CardHeader>
        <CardTitle>System Settings</CardTitle>
        <CardDescription>Configure the digital twin system parameters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Camera Settings */}
        <div className="space-y-3">
          <h3 className="font-medium">Camera Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="resolution">Resolution</Label>
              <Select
                disabled={!isOperator}
                value={cameraResolution}
                onValueChange={setCameraResolution}
              >
                <SelectTrigger id="resolution">
                  <SelectValue placeholder="Select resolution" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">HD (720p)</SelectItem>
                  <SelectItem value="1080p">Full HD (1080p)</SelectItem>
                  <SelectItem value="1440p">QHD (1440p)</SelectItem>
                  <SelectItem value="2160p">UHD (2160p)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="framerate">Frame Rate (FPS)</Label>
              <Select
                disabled={!isOperator}
                value={frameRate.toString()}
                onValueChange={(value) => setFrameRate(parseInt(value))}
              >
                <SelectTrigger id="framerate">
                  <SelectValue placeholder="Select frame rate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 FPS</SelectItem>
                  <SelectItem value="24">24 FPS</SelectItem>
                  <SelectItem value="30">30 FPS</SelectItem>
                  <SelectItem value="60">60 FPS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        
        <Separator />
        
        {/* Classification Settings */}
        <div className="space-y-3">
          <h3 className="font-medium">AI Classification Settings</h3>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label htmlFor="confidence">Confidence Threshold</Label>
              <span className="text-sm">{confidenceThreshold}%</span>
            </div>
            <Slider
              id="confidence"
              disabled={!isOperator}
              min={50}
              max={99}
              step={1}
              value={[confidenceThreshold]}
              onValueChange={(value) => setConfidenceThreshold(value[0])}
            />
            <p className="text-xs text-muted-foreground">
              Minimum confidence level required for positive classification
            </p>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="auto-mode">Automatic Mode</Label>
              <p className="text-xs text-muted-foreground">
                Enable automatic classification and sorting
              </p>
            </div>
            <Switch
              id="auto-mode"
              disabled={!isOperator}
              checked={autoMode}
              onCheckedChange={setAutoMode}
            />
          </div>
        </div>
        
        <Separator />
        
        {/* Alert Thresholds */}
        <div className="space-y-3">
          <h3 className="font-medium">Alert Thresholds</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="temp-high">High Temperature (°C)</Label>
              <Input
                id="temp-high"
                type="number"
                disabled={!isOperator}
                value={tempHighThreshold}
                onChange={(e) => setTempHighThreshold(parseInt(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Trigger alert when above this temperature
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="temp-low">Low Temperature (°C)</Label>
              <Input
                id="temp-low"
                type="number"
                disabled={!isOperator}
                value={tempLowThreshold}
                onChange={(e) => setTempLowThreshold(parseInt(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Trigger alert when below this temperature
              </p>
            </div>
          </div>
        </div>
        
        {isAdmin && (
          <>
            <Separator />
            
            {/* Maintenance Settings (Admin Only) */}
            <div className="space-y-3">
              <h3 className="font-medium">Maintenance Settings</h3>
              
              <div className="space-y-2">
                <Label htmlFor="maintenance-interval">Maintenance Interval (days)</Label>
                <Input
                  id="maintenance-interval"
                  type="number"
                  value={maintenanceInterval}
                  onChange={(e) => setMaintenanceInterval(parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Scheduled maintenance reminder frequency
                </p>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="notifications">Email Notifications</Label>
                  <p className="text-xs text-muted-foreground">
                    Send email alerts for critical events
                  </p>
                </div>
                <Switch
                  id="notifications"
                  checked={notificationsEnabled}
                  onCheckedChange={setNotificationsEnabled}
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="border-t pt-4 flex justify-between">
        <div className="text-sm text-muted-foreground">
          {!isOperator && !isAdmin && (
            <p className="text-amber-500 dark:text-amber-400">
              You do not have permission to change settings
            </p>
          )}
          {isOperator && !isAdmin && (
            <p>You can modify basic settings</p>
          )}
          {isAdmin && (
            <p>You have full administrative access</p>
          )}
        </div>
        
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            onClick={handleResetSettings}
            disabled={!isOperator && !isAdmin}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button 
            onClick={handleSaveSettings}
            disabled={!isOperator && !isAdmin}
          >
            <Save className="mr-2 h-4 w-4" />
            Save Settings
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default SettingsPanel;
