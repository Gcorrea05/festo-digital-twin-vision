// src/components/dashboard/ThreeDModel.tsx
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";
import { useActuatorSelection } from "@/context/ActuatorSelectionContext";
import { useLive } from "@/context/LiveContext";

/** Facets vindas do live */
type Facets = { S1?: 0 | 1; S2?: 0 | 1 };
type ActuatorSnapshot = { id: 1 | 2; facets?: Facets };

/** Resolve caminho dos GLBs respeitando BASE_URL (Vite) */
function getModelUrl(which: 1 | 2) {
  try {
    return new URL(`/A${which}.glb`, import.meta.env.BASE_URL).pathname;
  } catch {
    return `/A${which}.glb`;
  }
}

/** Hook que posiciona câmera/controles para enquadrar o objeto */
function useAutoFit(targetRef: React.RefObject<THREE.Object3D | null>) {
  const { camera, gl, controls } = useThree() as any; // controls vem do OrbitControls(makeDefault)
  const [sphere, setSphere] = useState<{ center: THREE.Vector3; radius: number } | null>(null);
  const [distances, setDistances] = useState({ min: 0.1, max: 100 });

  useEffect(() => {
    const obj = targetRef.current;
    if (!obj) return;

    const box = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;

    // distâncias proporcionais
    const minDistance = Math.max(0.25, radius * 0.8);
    const maxDistance = Math.max(5, radius * 12);

    // near/far + posição inicial
    camera.near = Math.max(0.01, radius / 50);
    camera.far = radius * 100;
    camera.updateProjectionMatrix();

    const fov = (camera.fov ?? 40) * (Math.PI / 180);
    const fitDist = radius / Math.sin(fov / 2);
    const direction = new THREE.Vector3(1.6, 1.2, 1.8).normalize();
    camera.position.copy(center.clone().add(direction.multiplyScalar(fitDist * 0.9)));

    if (controls) {
      controls.target.copy(center);
      controls.minDistance = minDistance;
      controls.maxDistance = maxDistance;
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.zoomSpeed = 0.8;
      controls.rotateSpeed = 0.9;
      controls.update();
    }

    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    setSphere({ center, radius });
    setDistances({ min: minDistance, max: maxDistance });
  }, [camera, gl, controls, targetRef]);

  return { sphere, distances };
}

/** Modelo GLB com pequeno hook de animação opcional */
function GLBActuator({
  which,
  facets,
  groupRef,
}: {
  which: 1 | 2;
  facets?: Facets;
  groupRef: React.RefObject<THREE.Group>;
}) {
  const url = getModelUrl(which);

  // Pré-carrega ambas as variações
  useGLTF.preload(getModelUrl(1));
  useGLTF.preload(getModelUrl(2));

  const { scene } = useGLTF(url, true);

  useEffect(() => {
    if (!scene) return;
    scene.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }, [scene]);

  // Exemplo simples: desloca levemente no eixo Z quando S2=1
  useEffect(() => {
    const s2 = facets?.S2 ?? 0;
    if (groupRef.current) {
      const z = THREE.MathUtils.lerp(groupRef.current.position.z, s2 ? 0.25 : 0, 0.5);
      groupRef.current.position.z = z;
    }
  }, [facets?.S2, groupRef]);

  return <primitive object={scene} dispose={null} />;
}

/** Componente que executa o auto-fit e permite callback após calcular bounding */
function AutoFit({
  groupRef,
  onFit,
}: {
  groupRef: React.RefObject<THREE.Group>;
  onFit?: (center: THREE.Vector3, radius: number) => void;
}) {
  const { sphere, distances } = useAutoFit(groupRef);
  const { controls } = useThree() as any;
  useEffect(() => {
    if (!controls || !sphere) return;
    controls.minDistance = distances.min;
    controls.maxDistance = distances.max;
    controls.update();
    onFit?.(sphere.center, sphere.radius);
  }, [controls, sphere, distances, onFit]);
  return null;
}

export default function ThreeDModel() {
  const { snapshot } = useLive();
  const { setSelectedId } = useActuatorSelection();

  const [modelIndex, setModelIndex] = useState<1 | 2>(1);
  const [viewMode, setViewMode] = useState<"free" | "front">("free");

  // LIVE (câmera do usuário)
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => setSelectedId(modelIndex), [modelIndex, setSelectedId]);

  const facets = useMemo(() => {
    const list = (snapshot?.actuators ?? []) as ActuatorSnapshot[];
    return list.find((a) => a.id === modelIndex)?.facets;
  }, [snapshot, modelIndex]);

  // sanity-check de arquivo
  useEffect(() => {
    const url = getModelUrl(modelIndex);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      })
      .catch((e) => {
        console.error(
          `[3D] Falha ao carregar ${url}. Coloque A${modelIndex}.glb em /public (respeite maiúsculas/minúsculas).`,
          e
        );
      });
  }, [modelIndex]);

  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);

  // Abre/fecha webcam
  useEffect(() => {
    const open = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        camStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.error("Erro ao acessar a câmera:", err);
        setShowCamera(false);
      }
    };
    const close = () => {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    if (showCamera) open();
    else close();

    return () => close();
  }, [showCamera]);

  // aplica "Front View"
  const applyFrontView = (center: THREE.Vector3, radius: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object as THREE.PerspectiveCamera;

    const fov = (camera.fov ?? 40) * (Math.PI / 180);
    const fitDist = radius / Math.sin(fov / 2);

    // Frente olhando no +Z (ajuste se seu modelo usar outro eixo)
    camera.position.set(center.x, center.y, center.z + fitDist * 0.9);
    controls.target.copy(center);
    controls.enableRotate = false; // trava rotação na vista frontal
    controls.update();
  };

  // volta ao "Free View"
  const applyFreeView = () => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.enableRotate = true;
    // libera ângulos caso tenha sido travado antes
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.update();
  };

  return (
    <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
      {/* Tabs Modelo 1/2 */}
      <div className="mb-3 flex items-center gap-2">
        <button
          className={`px-3 py-1 rounded-md text-sm ${
            modelIndex === 1 ? "bg-primary text-white" : "bg-zinc-200 dark:bg-zinc-800"
          }`}
          onClick={() => setModelIndex(1)}
        >
          Modelo 1
        </button>
        <button
          className={`px-3 py-1 rounded-md text-sm ${
            modelIndex === 2 ? "bg-primary text-white" : "bg-zinc-200 dark:bg-zinc-800"
          }`}
          onClick={() => setModelIndex(2)}
        >
          Modelo 2
        </button>
      </div>

      {/* Canvas */}
      <div className="h-[460px] w-full rounded-lg overflow-hidden bg-zinc-50 dark:bg-zinc-900">
        <Canvas
          key={modelIndex} // força remontagem ao trocar de modelo
          camera={{ position: [3, 2, 5], fov: 40, near: 0.1, far: 200 }}
          gl={{ preserveDrawingBuffer: true }}
          shadows
          onCreated={({ gl }) => gl.setClearColor(new THREE.Color("#0b0f1a"))}
        >
          {/* Luzes */}
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 3, 3]} intensity={1} castShadow />

          {/* Controles de órbita */}
          <OrbitControls ref={controlsRef} makeDefault enableZoom enablePan />

          {/* Conteúdo 3D */}
          <Suspense
            fallback={
              <Html center style={{ fontSize: 14, opacity: 0.8 }}>
                Carregando modelo…
              </Html>
            }
          >
            <group ref={groupRef}>
              <GLBActuator which={modelIndex} facets={facets} groupRef={groupRef} />
            </group>
          </Suspense>

          {/* Auto-fit e re-aplicação da vista */}
          <AutoFit
            groupRef={groupRef}
            onFit={(center, radius) => {
              if (viewMode === "front") applyFrontView(center, radius);
              else applyFreeView();
            }}
          />
        </Canvas>
      </div>

      {/* Toolbar embaixo do 3D (mesmo “vibe” do design) */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className={`px-3 py-1 rounded-md text-xs border ${
            viewMode === "free" ? "bg-zinc-200 dark:bg-zinc-800" : "bg-transparent"
          }`}
          onClick={() => {
            setViewMode("free");
            applyFreeView();
          }}
          title="Orbit livre"
        >
          🧭 Free View
        </button>

        <button
          className={`px-3 py-1 rounded-md text-xs border ${
            viewMode === "front" ? "bg-zinc-200 dark:bg-zinc-800" : "bg-transparent"
          }`}
          onClick={() => {
            setViewMode("front");
            // aplica imediatamente usando bounding atual
            const box = new THREE.Box3().setFromObject(groupRef.current ?? new THREE.Group());
            const center = new THREE.Vector3();
            const size = new THREE.Vector3();
            box.getCenter(center);
            box.getSize(size);
            const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
            applyFrontView(center, radius);
          }}
          title="Vista frontal"
        >
          ☐ Front View
        </button>

        <span className="mx-1 opacity-40 select-none">•</span>

        <button
          className={`px-3 py-1 rounded-md text-xs border ${
            showCamera ? "bg-emerald-600 text-white border-emerald-600" : "bg-transparent"
          }`}
          onClick={() => setShowCamera((v) => !v)}
          title="Abrir câmera do usuário"
        >
          {showCamera ? "Fechar Live" : "Live"}
        </button>
      </div>

      {/* Área da câmera (aparece só quando Live está ativo) */}
      {showCamera && (
        <div className="mt-3">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full rounded-md border"
          />
        </div>
      )}
    </div>
  );
}
