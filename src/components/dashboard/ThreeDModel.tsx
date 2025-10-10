// src/components/dashboard/ThreeDModel.tsx
import React, { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";
import { Compass, Square, Video } from "lucide-react";

/** ======= Props ======= */
export type ThreeDModelProps = {
  /** quando true, pausa a animação (usado pela Simulation) */
  paused?: boolean;
};

const FIT_MULTIPLIER = 0.9;
const INITIAL_DIR = new THREE.Vector3(1.6, 1.2, 1.8).normalize();
const INITIAL_FOV = 40;
const ANIM_ADVANCE_Z = 0.25;
const ANIM_MS = 180;

function getModelUrl(which: 1 | 2) {
  try {
    return new URL(`/A${which}FINALIZADO.glb`, import.meta.env.BASE_URL).pathname;
  } catch {
    return `/A${which}FINALIZADO.glb`;
  }
}

/** ========= Util: aplicar views ========= */
function applyFrontView(controls: any, center: THREE.Vector3, radius: number, invalidate?: () => void) {
  const camera = controls.object as THREE.PerspectiveCamera;
  const fov = (camera.fov ?? INITIAL_FOV) * (Math.PI / 180);
  const fitDist = radius / Math.sin(fov / 2);
  camera.position.set(center.x, center.y, center.z + fitDist * FIT_MULTIPLIER);
  controls.target.copy(center);
  controls.enableRotate = false;
  controls.update();
  invalidate?.();
}
function applyFreeView(controls: any, invalidate?: () => void) {
  controls.enableRotate = true;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.update();
  invalidate?.();
}

/** ========= Componentes que usam hooks R3F (sempre DENTRO do Canvas) ========= */
function InvalidateHandle({ fnRef }: { fnRef: React.MutableRefObject<(() => void) | null> }) {
  const { invalidate } = useThree();
  useEffect(() => {
    fnRef.current = () => invalidate();
    return () => void (fnRef.current = null);
  }, [invalidate, fnRef]);
  return null;
}

function AutoFit({
  groupRef,
  onFit,
}: {
  groupRef: React.RefObject<THREE.Group>;
  onFit?: (center: THREE.Vector3, radius: number) => void;
}) {
  const { camera, gl, controls, invalidate } = useThree() as any;
  useEffect(() => {
    const obj = groupRef.current;
    if (!obj) return;

    const box = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;

    camera.near = Math.max(0.01, radius / 50);
    camera.far = radius * 100;
    camera.fov = INITIAL_FOV;
    camera.updateProjectionMatrix();

    const fov = (camera.fov ?? INITIAL_FOV) * (Math.PI / 180);
    const fitDist = radius / Math.sin(fov / 2);
    camera.position.copy(center.clone().add(INITIAL_DIR.clone().multiplyScalar(fitDist * FIT_MULTIPLIER)));

    if (controls) {
      controls.target.copy(center);
      controls.minDistance = Math.max(0.25, radius * 0.8);
      controls.maxDistance = Math.max(5, radius * 12);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.zoomSpeed = 0.8;
      controls.rotateSpeed = 0.9;
      controls.update();
    }

    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    onFit?.(center, radius);
    invalidate();
  }, [camera, gl, controls, groupRef, invalidate, onFit]);

  return null;
}

function GLBActuator({
  which,
  groupRef,
}: {
  which: 1 | 2;
  groupRef: React.RefObject<THREE.Group>;
}) {
  const url = getModelUrl(which);
  useGLTF.preload(getModelUrl(1));
  useGLTF.preload(getModelUrl(2));

  let scene: THREE.Object3D | null = null;
  try {
    const loaded = useGLTF(url, true) as { scene: THREE.Object3D };
    scene = loaded.scene ?? null;
  } catch {
    scene = null;
  }

  // pequena animação no eixo Z quando trocar which (só pra dar sensação de vida)
  const { invalidate } = useThree();
  useEffect(() => {
    if (!groupRef.current) return;
    const targetZ = 0;
    let raf = 0;
    const start = groupRef.current.position.z;
    const t0 = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / ANIM_MS);
      groupRef.current!.position.z = THREE.MathUtils.lerp(start, targetZ, t);
      invalidate();
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [which, groupRef, invalidate]);

  if (scene) return <primitive object={scene} dispose={null} />;

  // fallback simples quando o GLB não está disponível
  return (
    <mesh castShadow={false} receiveShadow={false}>
      <boxGeometry args={[0.6, 0.4, 0.2]} />
      <meshStandardMaterial />
    </mesh>
  );
}

/** Driver de animação (spin) — fica DENTRO do Canvas */
function SpinDriver({
  paused,
  groupRef,
}: {
  paused: boolean | undefined;
  groupRef: React.RefObject<THREE.Group>;
}) {
  const { invalidate } = useThree();
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;

      if (!paused && groupRef.current) {
        groupRef.current.rotation.y += 0.6 * dt; // velocidade de rotação
      }

      invalidate(); // como estamos em frameloop="demand"
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, invalidate]);

  return null;
}

/** ======================= Principal ======================= */
export default function ThreeDModel({ paused }: ThreeDModelProps) {
  const [modelIndex, setModelIndex] = useState<1 | 2>(1);
  const [viewMode, setViewMode] = useState<"free" | "front">("free");
  const [showCamera, setShowCamera] = useState(false);

  // sanity check do arquivo GLB (fora do Canvas, sem hooks R3F)
  useEffect(() => {
    const url = getModelUrl(modelIndex);
    fetch(url).catch((e) => console.warn(`[3D] Falha ao carregar ${url}. Coloque o GLB em /public.`, e));
  }, [modelIndex]);

  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const lastCenterRef = useRef<THREE.Vector3 | null>(null);
  const lastRadiusRef = useRef<number>(1);
  const invalidateRef = useRef<() => void | null>(null);

  /** Webcam (overlay) */
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") setShowCamera(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const open = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } },
          audio: false,
        });
        camStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.warn("[3D] Erro ao acessar webcam:", err);
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

  return (
    <div className="relative w-full h-[500px] sm:h-[600px] bg-[#0a0a0a] rounded-2xl overflow-hidden">
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        shadows={false}
        camera={{ fov: INITIAL_FOV, position: [1.5, 1.2, 2.0] }}
        gl={{ antialias: false, powerPreference: "low-power", preserveDrawingBuffer: false }}
        onCreated={({ gl }) => {
          gl.setClearColor("#0a0a0a");
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <InvalidateHandle fnRef={invalidateRef} />

        <Suspense
          fallback={
            <Html>
              <div className="text-sm text-gray-400 animate-pulse">Carregando modelo 3D...</div>
            </Html>
          }
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />

          <group ref={groupRef}>
            <GLBActuator which={modelIndex} groupRef={groupRef} />
          </group>

          <AutoFit
            groupRef={groupRef}
            onFit={(center, radius) => {
              lastCenterRef.current = center.clone();
              lastRadiusRef.current = radius;
              if (controlsRef.current) {
                if (viewMode === "front") {
                  applyFrontView(controlsRef.current, center, radius, invalidateRef.current ?? undefined);
                } else {
                  applyFreeView(controlsRef.current, invalidateRef.current ?? undefined);
                }
              }
            }}
          />

          <OrbitControls ref={controlsRef} enablePan enableZoom />
          <SpinDriver paused={paused} groupRef={groupRef} />
        </Suspense>
      </Canvas>

      {showCamera && (
        <video
          ref={videoRef}
          className="absolute bottom-3 right-3 w-48 h-28 border border-gray-600 rounded-md shadow-md object-cover"
          muted
          playsInline
        />
      )}

      {/* Botões */}
      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <button
          onClick={() => setModelIndex((m) => (m === 1 ? 2 : 1))}
          className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded-md shadow"
        >
          Modelo A{modelIndex === 1 ? "2" : "1"}
        </button>

        <button
          onClick={() => {
            const next = viewMode === "free" ? "front" : "free";
            const c = lastCenterRef.current;
            const r = lastRadiusRef.current;
            if (controlsRef.current && c) {
              if (next === "front") {
                applyFrontView(controlsRef.current, c, r, invalidateRef.current ?? undefined);
              } else {
                applyFreeView(controlsRef.current, invalidateRef.current ?? undefined);
              }
            }
            setViewMode(next as typeof viewMode);
          }}
          className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1 rounded-md shadow flex items-center gap-1"
        >
          {viewMode === "free" ? (
            <>
              <Compass size={12} /> Livre
            </>
          ) : (
            <>
              <Square size={12} /> Frontal
            </>
          )}
        </button>

        <button
          onClick={() => setShowCamera((v) => !v)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1 rounded-md shadow flex items-center gap-1"
        >
          <Video size={12} />
          {showCamera ? "Fechar" : "Câmera"}
        </button>
      </div>
    </div>
  );
}
