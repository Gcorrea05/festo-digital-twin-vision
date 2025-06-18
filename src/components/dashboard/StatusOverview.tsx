import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';

const StatusOverview = () => {
  // Replace mock data with static data since mockData folder was deleted
  const systemStatus = {
    overall: 'operational',
    components: [
      { name: 'Conveyor', status: 'operational' },
      { name: 'Sensors', status: 'warning' },
      { name: 'Actuators', status: 'operational' },
      { name: 'Control System', status: 'operational' }
    ]
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'operational':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500';
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500';
      default:
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500';
    }
  };

  return (
    <Card className="col-span-12 md:col-span-4">
      <CardHeader>
        <CardTitle>System Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Status:</span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusClass(systemStatus.overall)}`}>
              {getStatusIcon(systemStatus.overall)}
              {systemStatus.overall.charAt(0).toUpperCase() + systemStatus.overall.slice(1)}
            </span>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold">Components:</h4>
            <ul className="ml-4 list-disc space-y-2">
              {systemStatus.components.map((component) => (
                <li key={component.name} className="flex items-center justify-between">
                  <span className="text-sm">{component.name}</span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusClass(component.status)}`}>
                    {getStatusIcon(component.status)}
                    {component.status.charAt(0).toUpperCase() + component.status.slice(1)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default StatusOverview;
