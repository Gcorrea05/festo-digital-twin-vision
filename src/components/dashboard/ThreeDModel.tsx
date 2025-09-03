import React, { useRef, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Move3D, Square, Video, Box } from "lucide-react";

// Componente genérico para carregar um modelo
const BlenderModel = ({ path }: { path: string }) => {
  const { scene } = useGLTF(path);
  return <primitive object={scene} scale={1.5} />;
};

const ThreeDModel = () => {
  const controlsRef = useRef<any>(null);
  const [mode, setMode] = useState<"3d" | "live">("3d"); // alterna entre 3D e Live
  const [selectedModel, setSelectedModel] = useState<"model1" | "model2">("model1"); // modelo selecionado
  const videoRef = useRef<HTMLVideoElement>(null);

  const resetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.object.position.set(8, 6, 10);
      controlsRef.current.object.lookAt(new THREE.Vector3(0, 0, 0));
      controlsRef.current.update();
    }
  };

  // Ativa a webcam quando modo "live" for selecionado
  useEffect(() => {
    if (mode === "live" && videoRef.current) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.error("Erro ao acessar webcam:", err);
        });
    }
  }, [mode]);

  return (
    <Card className="col-span-12">
      <CardHeader className="pb-2">
        <CardTitle>3D Model Visualization</CardTitle>
      </CardHeader>

      {/* Seletor de modelos */}
      <div className="flex gap-2 px-4 pb-2">
        <Button
          variant={selectedModel === "model1" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedModel("model1")}
        >
          <Box className="w-4 h-4 mr-2" />
          Modelo 1
        </Button>
        <Button
          variant={selectedModel === "model2" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedModel("model2")}
        >
          <Box className="w-4 h-4 mr-2" />
          Modelo 2
        </Button>
      </div>

      <CardContent className="flex flex-col space-y-4">
        {/* Área de exibição */}
        <div className="h-96 w-full relative bg-black/5 dark:bg-white/5 rounded-md overflow-hidden flex items-center justify-center">
          {mode === "3d" ? (
            <Canvas camera={{ position: [8, 6, 10], fov: 50 }}>
              <ambientLight intensity={0.5} />
              <pointLight position={[10, 10, 10]} intensity={1} />
              <pointLight position={[-10, -10, -10]} intensity={0.5} />

              {/* Escolha do modelo */}
              {selectedModel === "model1" ? (
                <BlenderModel path="/model.glb" />
              ) : (
                <BlenderModel path="/model.glb" />
              )}

              <OrbitControls ref={controlsRef} />
            </Canvas>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
            />
          )}
        </div>

        {/* Botões de controle */}
        <div className="flex gap-2">
          <Button
            variant={mode === "3d" ? "default" : "outline"}
            onClick={() => setMode("3d")}
          >
            <Move3D className="w-4 h-4 mr-2" />
            Free View
          </Button>

          <Button variant="outline" onClick={resetCamera}>
            <Square className="w-4 h-4 mr-2" />
            Front View
          </Button>

          <Button
            variant={mode === "live" ? "default" : "outline"}
            onClick={() => setMode("live")}
          >
            <Video className="w-4 h-4 mr-2" />
            Live
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ThreeDModel;
