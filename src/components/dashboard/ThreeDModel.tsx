// src/components/dashboard/ThreeDModel.tsx
import React, { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { Compass, Square, Video } from "lucide-react";
import { useLive } from "@/context/LiveContext";

/** ======= Props ======= */
export type ThreeDModelProps = {
  /** quando true, pausa a animação (usado pela Simulation) */
  paused?: boolean;
};

/** ======= Constantes de câmera/fit ======= */
const FIT_MULTIPLIER = 1.0;
const INITIAL_DIR = new THREE.Vector3(1.6, 1.2, 1.8).normalize();
const INITIAL_FOV = 20;
const ANIM_MS = 180;

// limites de zoom relativos à distância “de encaixe”
const ZOOM_MIN_FACTOR = 0.85; // minDistance = fitDist * 0.85 (evita ficar *muito* perto)
const ZOOM_MAX_FACTOR = 6.0;  // maxDistance = fitDist * 6

function getModelUrl(which: 1 | 2) {
  try {
    return new URL(`/A${which}FINALIZADO.glb`, import.meta.env.BASE_URL).pathname;
  } catch {
    return `/A${which}FINALIZADO.glb`;
  }
}

/** ========= Util: aplicar views ========= */
function applyFrontView(
  controls: any,
  center: THREE.Vector3,
  radius: number,
  invalidate?: () => void
) {
  const camera = controls.object as THREE.PerspectiveCamera;
  const fov = (camera.fov ?? INITIAL_FOV) * (Math.PI / 180);
  const fitDist = radius / Math.sin(fov / 2);

  camera.position.set(center.x, center.y, center.z + fitDist * FIT_MULTIPLIER);
  controls.target.copy(center);

  // só muda flags; não trava zoom, apenas ajusta limites
  controls.enableRotate = false;
  controls.enablePan = false;
  controls.enableZoom = true;

  // limites de zoom (sem resetar posição)
  controls.minDistance = fitDist * ZOOM_MIN_FACTOR;
  controls.maxDistance = fitDist * ZOOM_MAX_FACTOR;

  controls.update();
  invalidate?.();
}

function applyFreeView(
  controls: any,
  center?: THREE.Vector3,
  fitRadius?: number,
  invalidate?: () => void
) {
  if (center) controls.target.copy(center);

  controls.enableRotate = true;
  controls.enablePan = false;
  controls.enableZoom = true;

  controls.minPolarAngle = 0.0001;
  controls.maxPolarAngle = Math.PI - 0.0001;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;

  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.9;
  controls.zoomSpeed = 0.8;

  // Respeita os mesmos limites de zoom do fit atual (se informado)
  if (fitRadius && (controls.object as THREE.PerspectiveCamera)) {
    const cam: THREE.PerspectiveCamera = controls.object;
    const fov = (cam.fov ?? INITIAL_FOV) * (Math.PI / 180);
    const fitDist = fitRadius / Math.sin(fov / 2);
    controls.minDistance = fitDist * ZOOM_MIN_FACTOR;
    controls.maxDistance = fitDist * ZOOM_MAX_FACTOR;
  }

  controls.update();
  invalidate?.();
}

/** ========= Hooks R3F auxiliares ========= */
function InvalidateHandle({ fnRef }: { fnRef: React.MutableRefObject<(() => void) | null> }) {
  const { invalidate } = useThree();
  useEffect(() => {
    fnRef.current = () => invalidate();
    return () => void (fnRef.current = null);
  }, [invalidate, fnRef]);
  return null;
}

/** ========= AutoFit inicial ========= */
function AutoFit({
  groupRef,
  onFit,
}: {
  groupRef: React.RefObject<THREE.Group>;
  onFit?: (center: THREE.Vector3, radius: number) => void;
}) {
  const { camera, gl, invalidate } = useThree() as any;

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

    // Posição inicial **fora** do modelo (seguindo uma direção oblíqua)
    camera.position.copy(
      center.clone().add(INITIAL_DIR.clone().multiplyScalar(fitDist * FIT_MULTIPLIER))
    );

    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    onFit?.(center, radius);
    invalidate();
  }, [camera, gl, groupRef, invalidate, onFit]);

  return null;
}

/** ========= Centro “pinado” pra não respirar ========= */
function CenterPin({
  groupRef,
  lockedCenterRef,
}: {
  groupRef: React.RefObject<THREE.Group>;
  lockedCenterRef: React.MutableRefObject<THREE.Vector3 | null>;
}) {
  const bbox = useRef(new THREE.Box3());
  const curCenter = useRef(new THREE.Vector3());

  useFrame(() => {
    const g = groupRef.current;
    const locked = lockedCenterRef.current;
    if (!g || !locked) return;

    bbox.current.setFromObject(g);
    bbox.current.getCenter(curCenter.current);

    const dx = curCenter.current.x - locked.x;
    const dy = curCenter.current.y - locked.y;
    const dz = curCenter.current.z - locked.z;

    if (dx || dy || dz) {
      g.position.x -= dx;
      g.position.y -= dy;
      g.position.z -= dz;
    }
  });

  return null;
}

/** ========= GLB + animação ========= */
function GLBActuator({
  which,
  groupRef,
  paused,
}: {
  which: 1 | 2;
  groupRef: React.RefObject<THREE.Group>;
  paused?: boolean;
}) {
  const url = getModelUrl(which);
  useGLTF.preload(getModelUrl(1));
  useGLTF.preload(getModelUrl(2));

  // carrega GLTF
  let gltf: { scene: THREE.Object3D; animations?: THREE.AnimationClip[] } | null = null;
  try {
    gltf = useGLTF(url, true) as any;
  } catch {
    gltf = null;
  }

  // Mixer/ações (se houver animações no .glb)
  const localRef = useRef<THREE.Group>(null);
  const { actions, names, mixer } = useAnimations(gltf?.animations || [], localRef);

  useEffect(() => {
    if (!actions || !names) return;
    names.forEach((n) => actions[n]?.stop());
    names.forEach((n) => {
      const a = actions[n];
      if (a) {
        a.reset();
        a.clampWhenFinished = false;
        a.setLoop(THREE.LoopRepeat, Infinity);
        a.play();
      }
    });
    return () => names.forEach((n) => actions[n]?.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, actions, names]);

  useEffect(() => {
    if (mixer) mixer.timeScale = paused ? 0 : 1;
  }, [paused, mixer]);

  // micro-translação de feedback – opcional
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

  if (gltf?.scene) {
    return (
      <group ref={localRef}>
        <primitive object={gltf.scene} dispose={null} />
      </group>
    );
  }

  return (
    <mesh castShadow={false} receiveShadow={false}>
      <boxGeometry args={[0.6, 0.4, 0.2]} />
      <meshStandardMaterial />
    </mesh>
  );
}

/** ======================= Principal ======================= */
export default function ThreeDModel({ paused }: ThreeDModelProps) {
  const [modelIndex, setModelIndex] = useState<1 | 2>(1);
  const [viewMode, setViewMode] = useState<"free" | "front">("free");
  const [showCamera, setShowCamera] = useState(false);

  // status do sistema + hasStarted do atuador atual (controlam a animação)
  const { snapshot } = useLive();

  // decide qual atuador está “ativo” (selecionado na UI ou o do tab)
  const currentId: 1 | 2 | undefined =
    (snapshot?.selectedActuator as 1 | 2 | undefined) ?? modelIndex;

  const currentAct = snapshot?.actuators?.find((a) => a.id === currentId);
  const hasStarted = Boolean(currentAct?.hasStarted);

  const isSystemOK =
    String(snapshot?.system?.status ?? "").trim().toLowerCase() === "ok";

  // Pausar se: (1) explicitamente via prop, OU (2) sistema não ok, OU (3) ainda não destravou (sem borda AV->RE), OU (4) câmera ligada
  const pausedEffective = (paused ?? (!isSystemOK || !hasStarted)) || showCamera;

  // pré-carrega GLB
  useEffect(() => {
    const url = getModelUrl(modelIndex);
    fetch(url).catch((e) =>
      console.warn(`[3D] Falha ao carregar ${url}. Coloque o GLB em /public.`, e)
    );
  }, [modelIndex]);

  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const lastCenterRef = useRef<THREE.Vector3 | null>(null);
  const lastRadiusRef = useRef<number>(1);
  const lockedCenterRef = useRef<THREE.Vector3 | null>(null);
  const invalidateRef = useRef<() => void | null>(null);

  /** Webcam (overlay/substituição) */
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
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
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

  // Aplica restrições corretas ao trocar de modo (sem resetar zoom do usuário)
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const center = lastCenterRef.current ?? new THREE.Vector3(0, 0, 0);
    const radius = lastRadiusRef.current ?? 1;
    if (viewMode === "front") applyFrontView(c, center, radius, invalidateRef.current ?? undefined);
    else applyFreeView(c, center, radius, invalidateRef.current ?? undefined);
  }, [viewMode]);

  return (
    <div className="relative w-full rounded-2xl border border-white/10 bg-[#0a0f1a]/40 p-4">
      {/* Top tabs */}
      <div className="flex items-center gap-3 pb-3">
        <div className="inline-flex rounded-xl bg-black/30 p-1 border border-white/10">
          <button
            onClick={() => setModelIndex(1)}
            className={`px-4 py-1.5 text-sm rounded-lg transition ${
              modelIndex === 1 ? "bg-cyan-600 text-white" : "bg-transparent text-white/80 hover:text-white"
            }`}
            disabled={showCamera}
          >
            Modelo 1
          </button>
          <button
            onClick={() => setModelIndex(2)}
            className={`px-4 py-1.5 text-sm rounded-lg transition ${
              modelIndex === 2 ? "bg-cyan-600 text-white" : "bg-transparent text-white/80 hover:text-white"
            }`}
            disabled={showCamera}
          >
            Modelo 2
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="relative w-full h-[460px] rounded-xl overflow-hidden border border-white/10 bg-[#111]">
        {showCamera ? (
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay />
        ) : (
          <Canvas
            frameloop="always"
            dpr={[1, 1.5]}
            shadows={false}
            camera={{ fov: INITIAL_FOV, position: [1.5, 1.2, 2.0] }}
            gl={{ antialias: false, powerPreference: "low-power", preserveDrawingBuffer: false }}
            onCreated={({ gl }) => {
              gl.setClearColor("#111");
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
                <GLBActuator which={modelIndex} groupRef={groupRef} paused={pausedEffective} />
              </group>

              {/* re-fit apenas quando trocar de modelo */}
              <AutoFit
                key={modelIndex}
                groupRef={groupRef}
                onFit={(center, radius) => {
                  lastCenterRef.current = center.clone();
                  lastRadiusRef.current = radius;
                  lockedCenterRef.current = center.clone();

                  const c = controlsRef.current;
                  if (c) {
                    c.target.copy(center);
                    // ajusta limites de zoom sem “puxar” a câmera
                    const cam: THREE.PerspectiveCamera = c.object;
                    const fov = (cam.fov ?? INITIAL_FOV) * (Math.PI / 180);
                    const fitDist = radius / Math.sin(fov / 2);
                    c.minDistance = fitDist * ZOOM_MIN_FACTOR;
                    c.maxDistance = fitDist * ZOOM_MAX_FACTOR;
                    c.update();

                    if (viewMode === "front") applyFrontView(c, center, radius, invalidateRef.current ?? undefined);
                    else applyFreeView(c, center, radius, invalidateRef.current ?? undefined);
                  }
                }}
              />

              {/* Centro fixo para evitar “respiração” */}
              <CenterPin groupRef={groupRef} lockedCenterRef={lockedCenterRef} />

              <OrbitControls
                ref={controlsRef}
                makeDefault
                enableRotate={viewMode === "free"}
                enableZoom
                enablePan={false}
                // botões padrão
                mouseButtons={{
                  LEFT: THREE.MOUSE.ROTATE,
                  MIDDLE: THREE.MOUSE.DOLLY,
                  RIGHT: THREE.MOUSE.PAN,
                }}
              />
            </Suspense>
          </Canvas>
        )}

        {/* Bottom control bar */}
        <div className="absolute left-4 bottom-4 flex items-center gap-3">
          <button
            onClick={() => setViewMode("free")}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm border ${
              viewMode === "free"
                ? "bg-white/10 text-white border-white/20"
                : "bg-black/40 text-white/80 border-white/10 hover:text-white"
            }`}
            disabled={showCamera}
          >
            <Compass size={14} /> Free View
          </button>

          <button
            onClick={() => setViewMode("front")}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm border ${
              viewMode === "front"
                ? "bg-white/10 text-white border-white/20"
                : "bg-black/40 text-white/80 border-white/10 hover:text-white"
            }`}
            disabled={showCamera}
          >
            <Square size={14} /> Front View
          </button>

          <span className="text-white/40 select-none">•</span>

          <button
            onClick={() => setShowCamera((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm border transition ${
              showCamera
                ? "bg-emerald-700 text-white border-emerald-600"
                : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500"
            }`}
          >
            <Video size={14} /> Live
          </button>
        </div>
      </div>
    </div>
  );
}
