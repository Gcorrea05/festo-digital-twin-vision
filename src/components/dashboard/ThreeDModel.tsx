// src/components/dashboard/ThreeDModel.tsx
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";
import { useActuatorSelection } from "@/context/ActuatorSelectionContext";
import { useLive } from "@/context/LiveContext";
import { Compass, Square, Video } from "lucide-react";

/** ---------- KNOBS ---------- */
const FIT_MULTIPLIER = 0.9; // >1 afasta, <1 aproxima (após auto-fit)
const INITIAL_DIR = new THREE.Vector3(1.6, 1.2, 1.8).normalize(); // direção inicial da câmera
const INITIAL_FOV = 40;

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
  const { camera, gl, controls } = useThree() as any;
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

    // distâncias proporcionais p/ zoom
    const minDistance = Math.max(0.25, radius * 0.8);
    const maxDistance = Math.max(5, radius * 12);

    // near/far + posição inicial
    camera.near = Math.max(0.01, radius / 50);
    camera.far = radius * 100;
    camera.fov = INITIAL_FOV;
    camera.updateProjectionMatrix();

    const fov = (camera.fov ?? INITIAL_FOV) * (Math.PI / 180);
    const fitDist = radius / Math.sin(fov / 2);

    camera.position.copy(
      center.clone().add(INITIAL_DIR.clone().multiplyScalar(fitDist * FIT_MULTIPLIER))
    );

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
  useGLTF.preload(getModelUrl(1));
  useGLTF.preload(getModelUrl(2));
  const { scene } = useGLTF(url, true);

  useEffect(() => {
    if (!scene) return;
    scene.traverse((o) => {
      // @ts-ignore - alguns nós não tipam essas props
      o.castShadow = true;
      // @ts-ignore
      o.receiveShadow = true;
    });
  }, [scene]);

  // Exemplo: desloca levemente no Z quando S2=1
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

/** --- Principal --- */
export default function ThreeDModel() {
  const { snapshot } = useLive();
  const { setSelectedId } = useActuatorSelection();

  // índice do modelo (só 1/2). Câmera é controlada por showCamera.
  const [modelIndex, setModelIndex] = useState<1 | 2>(1);
  const [viewMode, setViewMode] = useState<"free" | "front">("free");
  const [showCamera, setShowCamera] = useState(false);

  // Câmera
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => setSelectedId(modelIndex), [modelIndex, setSelectedId]);

  const facets = useMemo(() => {
    const list = (snapshot?.actuators ?? []) as ActuatorSnapshot[];
    return list.find((a) => a.id === modelIndex)?.facets;
  }, [snapshot, modelIndex]);

  // sanity-check de arquivo (só quando NÃO está em câmera)
  useEffect(() => {
    if (showCamera) return;
    const url = getModelUrl(modelIndex);
    fetch(url).catch((e) =>
      console.error(
        `[3D] Falha ao carregar ${url}. Coloque A${modelIndex}.glb em /public (maiúsc/minúsc).`,
        e
      )
    );
  }, [showCamera, modelIndex]);
  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);

  // Abrir/fechar webcam ao clicar no botão Live
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
    const fov = (camera.fov ?? INITIAL_FOV) * (Math.PI / 180);
    const fitDist = radius / Math.sin(fov / 2);
    // Frente no +Z (ajuste conforme seu eixo)
    camera.position.set(center.x, center.y, center.z + fitDist * FIT_MULTIPLIER);
    controls.target.copy(center);
    controls.enableRotate = false;
    controls.update();
  };

  // volta ao "Free View"
  const applyFreeView = () => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.enableRotate = true;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.update();
  };

  /** Botão padrão (tamanho maior) */
  const TabButton = ({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      className={`px-5 py-2 rounded-md text-base font-medium ${
        active ? "bg-primary text-white" : "bg-zinc-200 dark:bg-zinc-800"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );

  return (
    <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
      {/* Tabs apenas dos modelos (sem aba de câmera) */}
      <div className="mb-3 flex items-center gap-3">
        <TabButton active={modelIndex === 1} onClick={() => setModelIndex(1)}>
          Modelo 1
        </TabButton>
        <TabButton active={modelIndex === 2} onClick={() => setModelIndex(2)}>
          Modelo 2
        </TabButton>
      </div>

      {/* Área principal: 3D OU CÂMERA no MESMO espaço */}
      <div className="h-[460px] w-full rounded-lg overflow-hidden bg-zinc-50 dark:bg-zinc-900">
        {showCamera ? (
          <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" muted />
        ) : (
          <Canvas
            key={modelIndex}
            camera={{ position: [3, 2, 5], fov: INITIAL_FOV, near: 0.1, far: 200 }}
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
        )}
      </div>

      {/* Toolbar embaixo (com botões maiores) */}
      <div className="mt-4 flex items-center gap-3">
        {/* Free View */}
        <button
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border ${
            viewMode === "free" ? "bg-zinc-200 dark:bg-zinc-800" : "bg-transparent"
          }`}
          onClick={() => {
            setViewMode("free");
            applyFreeView();
          }}
          title="Orbit livre"
        >
          <Compass className="w-4 h-4 opacity-70" />
          Free View
        </button>

        {/* Front View */}
        <button
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border ${
            viewMode === "front" ? "bg-zinc-200 dark:bg-zinc-800" : "bg-transparent"
          }`}
          onClick={() => {
            setViewMode("front");
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
          <Square className="w-4 h-4 opacity-70" />
          Front View
        </button>

        {/* separador visual */}
        <span className="mx-2 opacity-40 select-none">•</span>

        {/* Live (abre/fecha câmera no mesmo espaço) */}
        <button
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border ${
            showCamera ? "bg-emerald-600 text-white border-emerald-600" : "bg-transparent"
          }`}
          onClick={() => setShowCamera((v) => !v)}
          title="Abrir câmera do usuário"
        >
          <Video className="w-4 h-4 opacity-70" />
          {showCamera ? "Fechar Live" : "Live"}
        </button>
      </div>
    </div>
  );
}
