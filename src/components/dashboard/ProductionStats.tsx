
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const ProductionStats = () => {
  // Replace mock data with static data since mockData folder was deleted
  const productionData = [
    { name: 'Mon', production: 120, rejects: 8 },
    { name: 'Tue', production: 132, rejects: 6 },
    { name: 'Wed', production: 101, rejects: 10 },
    { name: 'Thu', production: 134, rejects: 7 },
    { name: 'Fri', production: 90, rejects: 4 },
    { name: 'Sat', production: 30, rejects: 2 },
    { name: 'Sun', production: 0, rejects: 0 },
  ];

  // Calculate totals for the pie chart
  const totalProducts = productionData.reduce((sum, day) => sum + day.production, 0);
  const totalDefects = productionData.reduce((sum, day) => sum + day.rejects, 0);
  const totalGood = totalProducts - totalDefects;
  
  const pieData = [
    { name: 'Good Products', value: totalGood },
    { name: 'Defective', value: totalDefects },
  ];
  
  const colors = ['#4CAF50', '#FF5722'];
  
  return (
    <Card className="col-span-full">
      <CardHeader className="pb-2">
        <CardTitle>Production Statistics</CardTitle>
        <CardDescription>Weekly production overview and defect rates</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col lg:flex-row">
        <div className="lg:w-2/3 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={productionData}
              margin={{ top: 20, right: 30, left: 20, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 12 }}
              />
              <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
              <Tooltip 
                formatter={(value, name) => {
                  // Safe way to format values
                  if (name === "production") {
                    return [`${value} units`, "Total Production"];
                  } else {
                    return [`${value} units`, "Defective Units"];
                  }
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="production" name="Total Production" fill="#1EAEDB" />
              <Bar yAxisId="right" dataKey="rejects" name="Defective Units" fill="#FF5722" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        <div className="lg:w-1/3 h-[300px] mt-8 lg:mt-0">
          <div className="text-center mb-2">
            <h3 className="text-base font-medium">Quality Overview</h3>
            <p className="text-sm text-muted-foreground">Total products: {totalProducts}</p>
          </div>
          <ResponsiveContainer width="100%" height="80%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip formatter={(value) => [`${value} units`, '']} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProductionStats;
