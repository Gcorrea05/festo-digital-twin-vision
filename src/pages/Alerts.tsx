import React, { useState } from 'react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, AlertTriangle, Info, BellRing, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const Alerts = () => {
  const [activeTab, setActiveTab] = useState("all");
  
  // Replace mock data with static data since mockData folder was deleted
  const alerts = [
    { 
      id: 1, 
      message: 'High temperature detected in Conveyor Motor', 
      severity: 'warning',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      details: 'Temperature reached 82°C, threshold is 75°C. Check cooling system.',
      acknowledged: false
    },
    { 
      id: 2, 
      message: 'Pressure sensor 3 reading abnormal values', 
      severity: 'warning',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      details: 'Fluctuating between 2.3 and 4.7 bar. Expected range is 2.8-3.2 bar.',
      acknowledged: true
    },
    { 
      id: 3, 
      message: 'Scheduled maintenance due for Sorting Module', 
      severity: 'info',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      details: 'Regular 30-day maintenance cycle. Last maintenance was April 10, 2025.',
      acknowledged: false
    },
    { 
      id: 4, 
      message: 'Object detection camera needs calibration', 
      severity: 'info',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
      details: 'Detection accuracy has dropped to 94.2%. Minimum required is 95%.',
      acknowledged: false
    },
    { 
      id: 5, 
      message: 'Critical error in pneumatic system', 
      severity: 'critical',
      timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      details: 'Pressure loss detected in main air supply line. System automatically switched to backup supply.',
      acknowledged: false
    }
  ];

  const unacknowledgedAlerts = alerts.filter(alert => !alert.acknowledged);
  const warningAlerts = alerts.filter(alert => alert.severity === 'warning');
  const infoAlerts = alerts.filter(alert => alert.severity === 'info');
  const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');

  const filteredAlerts = activeTab === "all" 
    ? alerts 
    : activeTab === "unacknowledged" 
      ? unacknowledgedAlerts 
      : activeTab === "warning"
        ? warningAlerts
        : activeTab === "info"
          ? infoAlerts
          : criticalAlerts;

  const handleAcknowledge = (id: number) => {
    // Implement acknowledge logic here, e.g., update state or send to API
    toast({
      title: "Alert Acknowledged",
      description: `Alert ID ${id} has been marked as acknowledged.`,
    });
  };

  return (
    <Layout title="Alerts" description="System alerts and notifications">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">
            <BellRing className="mr-2 h-4 w-4" />
            All Alerts
          </TabsTrigger>
          <TabsTrigger value="unacknowledged">
            <AlertTriangle className="mr-2 h-4 w-4" />
            Unacknowledged <Badge className="ml-2">{unacknowledgedAlerts.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="warning">
            <AlertTriangle className="mr-2 h-4 w-4" />
            Warnings <Badge className="ml-2">{warningAlerts.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="info">
            <Info className="mr-2 h-4 w-4" />
            Information <Badge className="ml-2">{infoAlerts.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="critical">
            <AlertCircle className="mr-2 h-4 w-4" />
            Critical <Badge className="ml-2">{criticalAlerts.length}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="pt-4">
          {filteredAlerts.map((alert) => (
            <Card key={alert.id} className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    {alert.severity === 'warning' && <AlertTriangle className="mr-2 h-4 w-4 text-yellow-500" />}
                    {alert.severity === 'info' && <Info className="mr-2 h-4 w-4 text-blue-500" />}
                    {alert.severity === 'critical' && <AlertCircle className="mr-2 h-4 w-4 text-red-500" />}
                    {alert.message}
                  </div>
                  <Badge variant={alert.acknowledged ? "secondary" : "default"}>
                    {alert.acknowledged ? "Acknowledged" : "New"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{alert.details}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(alert.timestamp).toLocaleString()}
                  </span>
                  {!alert.acknowledged && (
                    <Button size="sm" onClick={() => handleAcknowledge(alert.id)}>
                      <Check className="mr-2 h-4 w-4" />
                      Acknowledge
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="unacknowledged" className="pt-4">
          {filteredAlerts.map((alert) => (
            <Card key={alert.id} className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    {alert.severity === 'warning' && <AlertTriangle className="mr-2 h-4 w-4 text-yellow-500" />}
                    {alert.severity === 'info' && <Info className="mr-2 h-4 w-4 text-blue-500" />}
                    {alert.severity === 'critical' && <AlertCircle className="mr-2 h-4 w-4 text-red-500" />}
                    {alert.message}
                  </div>
                  <Badge variant={alert.acknowledged ? "secondary" : "default"}>
                    {alert.acknowledged ? "Acknowledged" : "New"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{alert.details}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(alert.timestamp).toLocaleString()}
                  </span>
                  {!alert.acknowledged && (
                    <Button size="sm" onClick={() => handleAcknowledge(alert.id)}>
                      <Check className="mr-2 h-4 w-4" />
                      Acknowledge
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="warning" className="pt-4">
          {filteredAlerts.map((alert) => (
            <Card key={alert.id} className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    {alert.severity === 'warning' && <AlertTriangle className="mr-2 h-4 w-4 text-yellow-500" />}
                    {alert.message}
                  </div>
                  <Badge variant={alert.acknowledged ? "secondary" : "default"}>
                    {alert.acknowledged ? "Acknowledged" : "New"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{alert.details}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(alert.timestamp).toLocaleString()}
                  </span>
                  {!alert.acknowledged && (
                    <Button size="sm" onClick={() => handleAcknowledge(alert.id)}>
                      <Check className="mr-2 h-4 w-4" />
                      Acknowledge
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="info" className="pt-4">
          {filteredAlerts.map((alert) => (
            <Card key={alert.id} className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    {alert.severity === 'info' && <Info className="mr-2 h-4 w-4 text-blue-500" />}
                    {alert.message}
                  </div>
                  <Badge variant={alert.acknowledged ? "secondary" : "default"}>
                    {alert.acknowledged ? "Acknowledged" : "New"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{alert.details}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(alert.timestamp).toLocaleString()}
                  </span>
                  {!alert.acknowledged && (
                    <Button size="sm" onClick={() => handleAcknowledge(alert.id)}>
                      <Check className="mr-2 h-4 w-4" />
                      Acknowledge
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
         <TabsContent value="critical" className="pt-4">
          {filteredAlerts.map((alert) => (
            <Card key={alert.id} className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    {alert.severity === 'critical' && <AlertCircle className="mr-2 h-4 w-4 text-red-500" />}
                    {alert.message}
                  </div>
                  <Badge variant={alert.acknowledged ? "secondary" : "default"}>
                    {alert.acknowledged ? "Acknowledged" : "New"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{alert.details}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {new Date(alert.timestamp).toLocaleString()}
                  </span>
                  {!alert.acknowledged && (
                    <Button size="sm" onClick={() => handleAcknowledge(alert.id)}>
                      <Check className="mr-2 h-4 w-4" />
                      Acknowledge
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </Layout>
  );
};

export default Alerts;
