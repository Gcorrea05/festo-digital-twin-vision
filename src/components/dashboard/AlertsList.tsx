import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, AlertCircle, Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const AlertsList = () => {
  // Replace mock data with static data since mockData folder was deleted
  const alerts = [
    { 
      id: 1, 
      message: 'High temperature detected in Conveyor Motor', 
      severity: 'warning',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString() 
    },
    { 
      id: 2, 
      message: 'Pressure sensor 3 reading abnormal values', 
      severity: 'warning',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString() 
    },
    { 
      id: 3, 
      message: 'Scheduled maintenance due for Sorting Module', 
      severity: 'info',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString() 
    },
    { 
      id: 4, 
      message: 'Object detection camera needs calibration', 
      severity: 'info',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString() 
    }
  ];

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'warning':
        return <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />;
      case 'critical':
        return <AlertCircle className="h-4 w-4 mr-2 text-red-500" />;
      case 'info':
        return <Bell className="h-4 w-4 mr-2 text-blue-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />;
    }
  };

  const timeAgo = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Alerts</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex items-center px-4 py-3">
              {getSeverityIcon(alert.severity)}
              <div className="flex-1">
                <p className="text-sm font-medium">{alert.message}</p>
                <p className="text-xs text-muted-foreground">{timeAgo(alert.timestamp)}</p>
              </div>
              <Badge variant="secondary">{alert.severity}</Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

export default AlertsList;
