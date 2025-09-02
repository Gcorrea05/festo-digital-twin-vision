import React, { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Move3D, Square } from "lucide-react";

// Novo componente que carrega o modelo do Blender
const BlenderModel = () => {
  const { scene } = useGLTF("/model.glb"); // <-- arquivo exportado do Blender dentro de /public
  return <primitive object={scene} scale={1.5} />;
};

const ThreeDModel = () => {
  const controlsRef = useRef<any>(null);

  const resetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.object.position.set(8, 6, 10); // posição inicial
      controlsRef.current.object.lookAt(new THREE.Vector3(0, 0, 0));
      controlsRef.current.update();
    }
  };

  return (
    <Card className="col-span-12">
      <CardHeader className="pb-2">
        <CardTitle>3D Model Visualization</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col space-y-4">
        {/* Canvas */}
        <div className="h-96 w-full relative bg-black/5 dark:bg-white/5 rounded-md overflow-hidden">
          <Canvas camera={{ position: [8, 6, 10], fov: 50 }}>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} />
            <pointLight position={[-10, -10, -10]} intensity={0.5} />

            {/* Antes era <ConveyorModel />, agora é o modelo do Blender */}
            <BlenderModel />

            <OrbitControls ref={controlsRef} />
          </Canvas>
        </div>

        {/* Botões */}
        <div className="flex gap-2">
          <Button variant="default">
            <Move3D className="w-4 h-4 mr-2" />
            Free View
          </Button>
          <Button variant="outline" onClick={resetCamera}>
            <Square className="w-4 h-4 mr-2" />
            Front View
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ThreeDModel;
