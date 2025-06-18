
import React, { useState } from 'react';
import Layout from '@/components/Layout';
import ProductionStats from '@/components/dashboard/ProductionStats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PieChart, Pie, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { AreaChart, Area } from 'recharts';
import { Download, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';

// Mock data for the analytics charts
const productTypeData = [
  { name: 'Type A', value: 540, color: '#4f46e5' },
  { name: 'Type B', value: 310, color: '#3b82f6' },
  { name: 'Type C', value: 280, color: '#0ea5e9' },
  { name: 'Type D', value: 120, color: '#22d3ee' }
];

const aiAccuracyData = [
  { date: '2025-04-01', accuracy: 92.4, falsePositives: 5.1, falseNegatives: 2.5 },
  { date: '2025-04-02', accuracy: 93.1, falsePositives: 4.8, falseNegatives: 2.1 },
  { date: '2025-04-03', accuracy: 92.7, falsePositives: 5.0, falseNegatives: 2.3 },
  { date: '2025-04-04', accuracy: 94.2, falsePositives: 3.6, falseNegatives: 2.2 },
  { date: '2025-04-05', accuracy: 95.1, falsePositives: 3.2, falseNegatives: 1.7 },
  { date: '2025-04-06', accuracy: 94.8, falsePositives: 3.5, falseNegatives: 1.7 },
  { date: '2025-04-07', accuracy: 96.3, falsePositives: 2.4, falseNegatives: 1.3 }
];

const operationalTimeData = [
  { date: '2025-04-01', operational: 22.5, maintenance: 1.5, downtime: 0 },
  { date: '2025-04-02', operational: 21, maintenance: 2, downtime: 1 },
  { date: '2025-04-03', operational: 23.5, maintenance: 0.5, downtime: 0 },
  { date: '2025-04-04', operational: 20, maintenance: 2, downtime: 2 },
  { date: '2025-04-05', operational: 24, maintenance: 0, downtime: 0 },
  { date: '2025-04-06', operational: 23, maintenance: 1, downtime: 0 },
  { date: '2025-04-07', operational: 21.5, maintenance: 2, downtime: 0.5 }
];

const energyConsumptionData = [
  { month: 'Jan', consumption: 2400 },
  { month: 'Feb', consumption: 2210 },
  { month: 'Mar', consumption: 2290 },
  { month: 'Apr', consumption: 2000 },
  { month: 'May', consumption: 2181 },
  { month: 'Jun', consumption: 2500 },
  { month: 'Jul', consumption: 2400 },
  { month: 'Aug', consumption: 2290 },
  { month: 'Sep', consumption: 2390 },
  { month: 'Oct', consumption: 2490 },
  { month: 'Nov', consumption: 2380 },
  { month: 'Dec', consumption: 2290 }
];

// KPI cards data
const kpis = [
  { title: "OEE (Overall Equipment Effectiveness)", value: "87.5%", change: "+2.3%", status: "improving" },
  { title: "Daily Production Rate", value: "521 units", change: "-3.4%", status: "decreasing" },
  { title: "Defect Rate", value: "3.2%", change: "-0.8%", status: "improving" },
  { title: "Cycle Time", value: "14.3 sec", change: "-0.3 sec", status: "improving" },
  { title: "AI Classification Accuracy", value: "96.3%", change: "+1.5%", status: "improving" },
  { title: "Energy Efficiency", value: "84.1%", change: "+0.7%", status: "improving" }
];

const Analytics = () => {
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <Layout title="Analytics" description="Performance metrics and statistical analysis">
      <div className="grid grid-cols-12 gap-6">
        {/* KPI summary cards */}
        <div className="col-span-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {kpis.map((kpi, index) => (
              <Card key={index}>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-muted-foreground">{kpi.title}</p>
                      <p className="text-2xl font-bold mt-1">{kpi.value}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      kpi.status === 'improving' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {kpi.change}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Date picker and export controls */}
        <div className="col-span-12 flex flex-col sm:flex-row justify-between items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[240px] justify-start">
                <Calendar className="mr-2 h-4 w-4" />
                {date ? format(date, 'PPP') : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={date}
                onSelect={setDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          <div className="flex gap-2">
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Production Analytics */}
        <div className="col-span-12">
          <ProductionStats />
        </div>
        
        {/* Component Tabs */}
        <div className="col-span-12">
          <Card>
            <CardHeader>
              <CardTitle>Performance Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="production">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="production">Production</TabsTrigger>
                  <TabsTrigger value="ai">AI Performance</TabsTrigger>
                  <TabsTrigger value="operational">Operational Time</TabsTrigger>
                  <TabsTrigger value="energy">Energy Consumption</TabsTrigger>
                </TabsList>
                
                <TabsContent value="production" className="pt-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="h-80">
                      <h3 className="text-lg font-medium mb-4">Product Distribution by Type</h3>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={productTypeData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          >
                            {productTypeData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [`${value} units`, 'Quantity']} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    
                    <div className="h-80">
                      <h3 className="text-lg font-medium mb-4">Daily Production Trend</h3>
                      <ChartContainer className="h-full" config={{}}>
                        <BarChart data={operationalTimeData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                          <YAxis />
                          <Tooltip content={<ChartTooltipContent />} />
                          <Legend />
                          <Bar dataKey="operational" name="Operational Hours" fill="#4f46e5" />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="ai" className="pt-4">
                  <div className="h-80">
                    <h3 className="text-lg font-medium mb-4">AI Classification Performance</h3>
                    <ChartContainer className="h-full" config={{}}>
                      <LineChart data={aiAccuracyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                        <YAxis domain={[75, 100]} tickFormatter={(value) => `${value}%`} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="accuracy" 
                          stroke="#4f46e5" 
                          strokeWidth={2} 
                          name="Accuracy" 
                        />
                        <Line 
                          type="monotone" 
                          dataKey="falsePositives" 
                          stroke="#ef4444" 
                          strokeWidth={2} 
                          name="False Positives" 
                        />
                        <Line 
                          type="monotone" 
                          dataKey="falseNegatives" 
                          stroke="#f59e0b" 
                          strokeWidth={2} 
                          name="False Negatives" 
                        />
                      </LineChart>
                    </ChartContainer>
                  </div>
                </TabsContent>
                
                <TabsContent value="operational" className="pt-4">
                  <div className="h-80">
                    <h3 className="text-lg font-medium mb-4">Operational Time Distribution</h3>
                    <ChartContainer className="h-full" config={{}}>
                      <AreaChart data={operationalTimeData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                        <YAxis />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="operational" 
                          stackId="1" 
                          stroke="#4f46e5" 
                          fill="#4f46e5" 
                          name="Operational" 
                        />
                        <Area 
                          type="monotone" 
                          dataKey="maintenance" 
                          stackId="1" 
                          stroke="#f59e0b" 
                          fill="#f59e0b" 
                          name="Maintenance" 
                        />
                        <Area 
                          type="monotone" 
                          dataKey="downtime" 
                          stackId="1" 
                          stroke="#ef4444" 
                          fill="#ef4444" 
                          name="Downtime" 
                        />
                      </AreaChart>
                    </ChartContainer>
                  </div>
                </TabsContent>
                
                <TabsContent value="energy" className="pt-4">
                  <div className="h-80">
                    <h3 className="text-lg font-medium mb-4">Monthly Energy Consumption</h3>
                    <ChartContainer className="h-full" config={{}}>
                      <BarChart data={energyConsumptionData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis tickFormatter={(value) => `${value} kWh`} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Legend />
                        <Bar dataKey="consumption" name="Energy (kWh)" fill="#10b981" />
                      </BarChart>
                    </ChartContainer>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Analytics;
