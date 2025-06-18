
import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import {
  ViewIcon,
  BoxIcon,
  RotateCwIcon,
  ComponentIcon,
  Boxes,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Define the 3D model component
const ThreeDModel = () => {
  const [viewMode, setViewMode] = useState<'free' | 'front' | 'top' | 'side'>('front');
  const [highlightComponent, setHighlightComponent] = useState<'all' | 'sensor' | 'motor' | 'none'>('all');
  const { toast } = useToast();

  // Handle view mode changes
  const handleViewChange = (mode: 'free' | 'front' | 'top' | 'side') => {
    setViewMode(mode);
    
    toast({
      title: `View changed to ${mode}`,
      description: `Displaying ${mode} view of the conveyor system`,
      duration: 2000,
    });
  };

  // Handle component highlight changes
  const handleComponentChange = (component: 'all' | 'sensor' | 'motor' | 'none') => {
    setHighlightComponent(component);
    
    toast({
      title: component === 'all' 
        ? 'Showing all components' 
        : `Highlighting ${component}s`,
      description: component === 'none' 
        ? 'All component highlights turned off' 
        : `${component === 'all' ? 'All components' : component + 's'} are now visible in the 3D model`,
      duration: 2000,
    });
  };

  return (
    <Card className="col-span-12">
      <CardHeader className="pb-2">
        <CardTitle>3D Model Visualization</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col space-y-4">
        {/* View controls */}
        <div className="flex flex-wrap gap-2">
          <Button 
            variant={viewMode === 'front' ? 'default' : 'outline'} 
            size="sm" 
            onClick={() => handleViewChange('front')}
            className="flex items-center space-x-1"
          >
            <ViewIcon className="h-4 w-4 mr-1" />
            Front View
          </Button>
          <Button 
            variant={viewMode === 'top' ? 'default' : 'outline'} 
            size="sm" 
            onClick={() => handleViewChange('top')}
            className="flex items-center space-x-1"
          >
            <BoxIcon className="h-4 w-4 mr-1" />
            Top View
          </Button>
          <Button 
            variant={viewMode === 'side' ? 'default' : 'outline'} 
            size="sm" 
            onClick={() => handleViewChange('side')}
            className="flex items-center space-x-1"
          >
            <ComponentIcon className="h-4 w-4 mr-1" />
            Side View
          </Button>
          <Button 
            variant={viewMode === 'free' ? 'default' : 'outline'} 
            size="sm" 
            onClick={() => handleViewChange('free')}
            className="flex items-center space-x-1"
          >
            <RotateCwIcon className="h-4 w-4 mr-1" />
            Free View
          </Button>
        </div>
        
        {/* Component highlight controls */}
        <div className="flex flex-wrap gap-2">
          <Button 
            variant={highlightComponent === 'all' ? 'default' : 'outline'} 
            size="sm" 
            onClick={() => handleComponentChange('all')}
            className="flex items-center space-x-1"
          >
            <Boxes className="h-4 w-4 mr-1" />
            All Components
          </Button>
          <Button 
            variant={highlightComponent === 'sensor' ? 'default' : 'outline'} 
            size="sm" 
            onClick={() => handleComponentChange('sensor')}
            className="flex items-center space-x-1"
          >
            <AlertCircle className="h-4 w-4 mr-1" />
            Sensors
          </Button>
          <Button 
            variant={highlightComponent === 'motor' ? 'default' : 'outline'} 
            size="sm" 
            onClick={() => handleComponentChange('motor')}
            className="flex items-center space-x-1"
          >
            <ComponentIcon className="h-4 w-4 mr-1" />
            Motors
          </Button>
          <Button 
            variant={highlightComponent === 'none' ? 'default' : 'outline'} 
            size="sm" 
            onClick={() => handleComponentChange('none')}
            className="flex items-center space-x-1"
          >
            <BoxIcon className="h-4 w-4 mr-1" />
            Hide Highlights
          </Button>
        </div>
        
        {/* 3D Canvas */}
        <div className="h-96 w-full relative bg-black/5 dark:bg-white/5 rounded-md overflow-hidden">
          <Canvas>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <pointLight position={[-10, -10, -10]} intensity={0.5} />
            
            {/* Camera presets based on viewMode */}
            {viewMode === 'front' && (
              <OrbitControls 
                enableZoom={true} 
                enablePan={false} 
                enableRotate={false}
                target={[0, 0, 0]}
                maxPolarAngle={Math.PI / 2}
                minPolarAngle={Math.PI / 4}
                position0={[0, 2, 5]}
              />
            )}
            
            {viewMode === 'top' && (
              <OrbitControls 
                enableZoom={true} 
                enablePan={false} 
                enableRotate={false}
                target={[0, 0, 0]}
                maxPolarAngle={Math.PI / 4}
                minPolarAngle={0}
                position0={[0, 5, 0]}
              />
            )}
            
            {viewMode === 'side' && (
              <OrbitControls 
                enableZoom={true} 
                enablePan={false} 
                enableRotate={false}
                target={[0, 0, 0]}
                maxPolarAngle={Math.PI / 2}
                minPolarAngle={Math.PI / 4}
                position0={[5, 2, 0]}
              />
            )}
            
            {viewMode === 'free' && (
              <OrbitControls 
                enableZoom={true} 
                enablePan={true} 
                enableRotate={true}
                target={[0, 0, 0]}
                maxPolarAngle={Math.PI}
              />
            )}
            
            <ConveyorModel highlightComponent={highlightComponent} />
          </Canvas>
        </div>
      </CardContent>
    </Card>
  );
};

// Conveyor model component
interface ConveyorModelProps {
  highlightComponent: 'all' | 'sensor' | 'motor' | 'none';
}

const ConveyorModel: React.FC<ConveyorModelProps> = ({ highlightComponent }) => {
  return (
    <group>
      {/* Conveyor Base */}
      <mesh position={[0, -1, 0]}>
        <boxGeometry args={[5, 0.2, 1.5]} />
        <meshStandardMaterial color="#555555" />
      </mesh>
      
      {/* Conveyor Belt Surface */}
      <mesh position={[0, -0.45, 0]}>
        <boxGeometry args={[4.8, 0.05, 0.8]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      
      {/* Conveyor Rollers */}
      <ConveyorRoller position={[-2, -0.45, 0]} />
      <ConveyorRoller position={[2, -0.45, 0]} />
      
      {/* Conveyor Supports */}
      <mesh position={[-2.2, -0.7, 0]}>
        <boxGeometry args={[0.2, 0.4, 1]} />
        <meshStandardMaterial color="#555555" />
      </mesh>
      <mesh position={[2.2, -0.7, 0]}>
        <boxGeometry args={[0.2, 0.4, 1]} />
        <meshStandardMaterial color="#555555" />
      </mesh>
      
      {/* Sensors */}
      <ComponentIndicator 
        position={[-1.8, -0.3, 0.5]} 
        status="ok" 
        type="sensor"
        visible={highlightComponent === 'all' || highlightComponent === 'sensor'}
      />
      <ComponentIndicator 
        position={[0, -0.3, 0.5]} 
        status="warning" 
        type="sensor"
        visible={highlightComponent === 'all' || highlightComponent === 'sensor'}
      />
      <ComponentIndicator 
        position={[1.8, -0.3, 0.5]} 
        status="error" 
        type="sensor"
        visible={highlightComponent === 'all' || highlightComponent === 'sensor'}
      />
      
      {/* Motors */}
      <ComponentIndicator 
        position={[-2.3, -0.45, 0]} 
        status="ok" 
        type="motor"
        visible={highlightComponent === 'all' || highlightComponent === 'motor'}
      />
      <ComponentIndicator 
        position={[2.3, -0.45, 0]} 
        status="ok" 
        type="motor"
        visible={highlightComponent === 'all' || highlightComponent === 'motor'}
      />

      {/* Add conveyor belt pattern */}
      <mesh position={[0, -0.43, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.8, 0.8]} />
        <meshStandardMaterial color="#444444" opacity={0.8} transparent />
      </mesh>
    </group>
  );
};

// Create a conveyor pattern
const ConveyorPattern = () => {
  return (
    <meshStandardMaterial color="#444444" />
  );
};

// Conveyor roller component
interface ConveyorRollerProps {
  position: [number, number, number];
}

const ConveyorRoller = ({ position }: ConveyorRollerProps) => {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.3, 0.3, 0.8, 16]} />
      <meshStandardMaterial color="#777777" />
    </mesh>
  );
};

// Component indicator with status light
interface ComponentIndicatorProps {
  position: [number, number, number];
  status: 'ok' | 'warning' | 'error';
  type: 'sensor' | 'motor';
  visible: boolean;
}

const ComponentIndicator: React.FC<ComponentIndicatorProps> = ({ position, status, type, visible }) => {
  const lightRef = useRef<THREE.Mesh>(null);
  
  // Use frame to animate the status light
  useFrame(({ clock }) => {
    if (lightRef.current && status !== 'ok') {
      // Create blinking effect for warning and error statuses
      const pulseFactor = Math.sin(clock.getElapsedTime() * 3) * 0.5 + 0.5;
      
      // Safe access to material properties
      if (lightRef.current.material instanceof THREE.MeshStandardMaterial) {
        lightRef.current.material.emissiveIntensity = 
          status === 'error' ? 0.5 + pulseFactor * 0.5 : 0.3 + pulseFactor * 0.3;
      }
    }
  });

  if (!visible) return null;
  
  // Helper function to get status color
  const getStatusColor = (status: 'ok' | 'warning' | 'error') => {
    switch (status) {
      case 'ok': return '#4CAF50'; // Green
      case 'warning': return '#FFC107'; // Yellow
      case 'error': return '#F44336'; // Red
      default: return '#CCCCCC'; // Default gray
    }
  };
  
  return (
    <group position={position}>
      {/* Component body */}
      <mesh>
        {type === 'sensor' ? (
          <boxGeometry args={[0.15, 0.15, 0.15]} />
        ) : (
          <cylinderGeometry args={[0.2, 0.2, 0.4, 16]} />
        )}
        <meshStandardMaterial color={type === 'sensor' ? '#1EAEDB' : '#444444'} />
      </mesh>
      
      {/* Status indicator light */}
      <mesh 
        ref={lightRef} 
        position={[0, type === 'sensor' ? 0.1 : 0.3, 0]}
      >
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial 
          emissive={getStatusColor(status)}
          emissiveIntensity={0.5}
          color={getStatusColor(status)}
        />
      </mesh>
    </group>
  );
};

export default ThreeDModel;
