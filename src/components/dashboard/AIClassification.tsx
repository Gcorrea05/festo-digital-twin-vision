import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const AIClassification: React.FC = () => {
  return (
    <Card className="col-span-full md:col-span-6 lg:col-span-3 xl:col-span-3">
      <CardHeader className="pb-2">
        <CardTitle>AI Classification</CardTitle>
        <CardDescription>Real-time product quality monitoring</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-gray-500">Placeholder - aguardando dados da IA</p>
      </CardContent>
    </Card>
  );
};

export default AIClassification;
