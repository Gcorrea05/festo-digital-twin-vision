// src/components/dashboard/ThreeDModel.tsx
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";
import { Compass, Square, Video } from "lucide-react";

import { useActuatorSelection } from "@/context/ActuatorSelectionContext";
import { useLive } from "@/context/LiveContext";
import { useOpcStream } from "@/hooks/useOpcStream";

/** ============================
 *            KNOBS
 *  Edite aqui para ajustar rápido
 * ============================ */
const FIT_MULTIPLIER = 0.9;                 // >1 afasta, <1 aproxima após auto-fit
const INITIAL_DIR = new THREE.Vector3(1.6, 1.2, 1.8).normalize();
const INITIAL_FOV = 40;

const ANIM_ADVANCE_Z = 0.25;               // deslocamento Z quando S2=1
const ANIM_MS = 180;                       // duração da animação (ms)

const SHOW_FALLBACK_BOX_WHEN_MISSING = true; // desenha um cubo caso GLB não exista

// Gera nomes dos sinais (caso o backend mude o padrão, altere aqui)
const signalName = {
  S1: (idx: 1 | 2) => `Recuado_${idx}S1`,
  S2: (idx: 1 | 2) => `Avancado_${idx}S2`,
};

// Resolve caminho do GLB respeitando BASE_URL
function getModelUrl(which: 1 | 2) {
  try {
    return new URL(`/A${which}FINALIZADO.glb`, import.meta.env.BASE_URL).pathname;
  } catch {
    return `/A${which}FINALIZADO .glb`;
  }
}

/** ---------- Tipos ---------- */
type Facets = { S1?: 0 | 1; S2?: 0 | 1 };
type ActuatorSnapshot = { id: 1 | 2; facets?: Facets };

/** ---------- Auto-fit da câmera ---------- */
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

    const minDistance = Math.max(0.25, radius * 0.8);
    const maxDistance = Math.max(5, radius * 12);

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

/** ---------- Modelo GLB + animação por S2 ---------- */
function GLBActuator({
  which,
  facets,
  groupRef,
  glbOkRef,
}: {
  which: 1 | 2;
  facets?: Facets;
  groupRef: React.RefObject<THREE.Group>;
  glbOkRef: React.MutableRefObject<boolean>;
}) {
  const url = getModelUrl(which);
  useGLTF.preload(getModelUrl(1));
  useGLTF.preload(getModelUrl(2));

  let scene: THREE.Object3D | null = null;
  try {
    const loaded = useGLTF(url, true) as { scene: THREE.Object3D };
    scene = loaded.scene ?? null;
    glbOkRef.current = !!scene;
  } catch {
    glbOkRef.current = false;
  }

  useEffect(() => {
    if (!scene) return;
    scene.traverse((o: any) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }, [scene]);

  // anima suavemente deslocamento Z quando S2=1
  useEffect(() => {
    const s2 = facets?.S2 ?? 0;
    if (!groupRef.current) return;
    const targetZ = s2 ? ANIM_ADVANCE_Z : 0;
    let raf = 0;
    const start = groupRef.current.position.z;
    const t0 = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / ANIM_MS);
      groupRef.current!.position.z = THREE.MathUtils.lerp(start, targetZ, t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [facets?.S2, groupRef]);

  if (scene) return <primitive object={scene} dispose={null} />;

  // Fallback minimalista (cubo), quando o GLB não está disponível
  return SHOW_FALLBACK_BOX_WHEN_MISSING ? (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[0.6, 0.4, 0.2]} />
      <meshStandardMaterial color="#4f46e5" />
    </mesh>
  ) : null;
}

/** ---------- Wrapper para aplicar auto-fit e (re)ajustes de controle ---------- */
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
/** ---------- Principal ---------- */
export default function ThreeDModel() {
  const { snapshot, setSelectedActuator } = useLive(); // integra filtro relativo
  const { setSelectedId } = useActuatorSelection();

  // índice do modelo (1 ou 2)
  const [modelIndex, setModelIndex] = useState<1 | 2>(1);
  const [viewMode, setViewMode] = useState<"free" | "front">("free");
  const [showCamera, setShowCamera] = useState(false);

  // nomes dos sinais
  const s1Name = signalName.S1(modelIndex);
  const s2Name = signalName.S2(modelIndex);

  // stream polling dos sinais
  const { last: lastS1 } = useOpcStream({ name: s1Name });
  const { last: lastS2 } = useOpcStream({ name: s2Name });

  // manter seleção global (contexts): 3D seleciona atuador e dashboard filtra
  useEffect(() => {
    setSelectedId(modelIndex);
    setSelectedActuator(modelIndex);
    return () => {
      // opcional: não limpar filtro no unmount; se quiser limpar, descomente:
      // setSelectedActuator(null);
    };
  }, [modelIndex, setSelectedId, setSelectedActuator]);

  // facets vindas do snapshot + overrides do stream
  const facetsFromSnapshot = useMemo(() => {
    const list = (snapshot?.actuators ?? []) as ActuatorSnapshot[];
    return list.find((a) => a.id === modelIndex)?.facets ?? {};
  }, [snapshot, modelIndex]);

  const [facetsWs, setFacetsWs] = useState<Facets>({});
  useEffect(() => setFacetsWs({}), [modelIndex]); // limpa ao trocar modelo

  useEffect(() => {
    if (lastS1?.name === s1Name && typeof lastS1.value_bool === "boolean") {
      setFacetsWs((f) => ({ ...f, S1: lastS1.value_bool ? 1 : 0 }));
    }
  }, [lastS1, s1Name]);

  useEffect(() => {
    if (lastS2?.name === s2Name && typeof lastS2.value_bool === "boolean") {
      setFacetsWs((f) => ({ ...f, S2: lastS2.value_bool ? 1 : 0 }));
    }
  }, [lastS2, s2Name]);

  const facets: Facets = useMemo(
    () => ({
      S1: facetsWs.S1 ?? facetsFromSnapshot.S1 ?? 0,
      S2: facetsWs.S2 ?? facetsFromSnapshot.S2 ?? 0,
    }),
    [facetsFromSnapshot, facetsWs]
  );

  // sanity-check de arquivo (só quando NÃO está em câmera)
  useEffect(() => {
    if (showCamera) return;
    const url = getModelUrl(modelIndex);
    fetch(url).catch((e) =>
      console.error(
        `[3D] Falha ao carregar ${url}. Coloque A${modelIndex}.glb em /public (respeita maiúsc/minúsc).`,
        e
      )
    );
  }, [showCamera, modelIndex]);

  // refs
  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const glbOkRef = useRef<boolean>(true);

  /** Webcam (Live) no mesmo espaço do canvas */
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);

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

  // aplicar “Front View”
  const applyFrontView = (center: THREE.Vector3, radius: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object as THREE.PerspectiveCamera;
    const fov = (camera.fov ?? INITIAL_FOV) * (Math.PI / 180);
    const fitDist = radius / Math.sin(fov / 2);
    camera.position.set(center.x, center.y, center.z + fitDist * FIT_MULTIPLIER);
    controls.target.copy(center);
    controls.enableRotate = false;
    controls.update();
  };

  // voltar ao “Free View”
  const applyFreeView = () => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.enableRotate = true;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.update();
  };

  /** Botão padrão */
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
      {/* Tabs: modelo 1 / 2 */}
      <div className="mb-3 flex items-center gap-3">
        <TabButton active={modelIndex === 1} onClick={() => setModelIndex(1)}>
          Modelo 1
        </TabButton>
        <TabButton active={modelIndex === 2} onClick={() => setModelIndex(2)}>
          Modelo 2
        </TabButton>
      </div>

      {/* 3D ou câmera (no mesmo espaço) */}
      <div
        className="
          relative w-full overflow-hidden rounded-lg
          bg-zinc-50 dark:bg-zinc-900
          aspect-[16/9] md:aspect-[21/9] min-h-64
          max-h-[calc(100vh-var(--header-h)-220px)]
        "
      >
        {showCamera ? (
          <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" muted />
        ) : (
          <Canvas
            key={modelIndex}
            camera={{ position: [3, 2, 5], fov: INITIAL_FOV, near: 0.1, far: 200 }}
            gl={{ preserveDrawingBuffer: true }}
            dpr={[1, 2]}
            style={{ height: "100%", width: "100%" }}
            onCreated={({ gl }) => gl.setClearColor(new THREE.Color("#0b0f1a"))}
            shadows
          >
            {/* Luzes */}
            <ambientLight intensity={0.7} />
            <directionalLight position={[3, 3, 3]} intensity={1} castShadow />

            {/* Controles */}
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
                <GLBActuator
                  which={modelIndex}
                  facets={facets}
                  groupRef={groupRef}
                  glbOkRef={glbOkRef}
                />
              </group>
            </Suspense>

            {/* Auto-fit + re-aplica view mode */}
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

      {/* Toolbar */}
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

        {/* separador */}
        <span className="mx-2 opacity-40 select-none">•</span>

        {/* Live camera (mesmo espaço) */}
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
