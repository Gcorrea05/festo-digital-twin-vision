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

// Mais afastado no fit inicial
const FIT_MULTIPLIER = 1.0;
const INITIAL_DIR = new THREE.Vector3(1.6, 1.2, 1.8).normalize();
const INITIAL_FOV = 20;
const ANIM_MS = 180;

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

  controls.enableRotate = false;
  controls.enablePan = false;
  controls.enableZoom = true;

  controls.update();
  invalidate?.();
}

function applyFreeView(
  controls: any,
  center?: THREE.Vector3,
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

  controls.update();
  invalidate?.();
}

/** ========= Hooks R3F auxiliares (Canvas) ========= */
function InvalidateHandle({ fnRef }: { fnRef: React.MutableRefObject<(() => void) | null> }) {
  const { invalidate } = useThree();
  useEffect(() => {
    fnRef.current = () => invalidate();
    return () => void (fnRef.current = null);
  }, [invalidate, fnRef]);
  return null;
}

/** ========= AutoFit inicial =========
 * IMPORTANTE: não depender de `onFit` (função instável) para não refitar a cada render.
 */
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
    camera.position.copy(
      center.clone().add(INITIAL_DIR.clone().multiplyScalar(fitDist * FIT_MULTIPLIER))
    );

    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    onFit?.(center, radius);
    invalidate();
    // ⬇️ NÃO incluir `onFit` aqui — manter o fit somente no mount
  }, [camera, gl, groupRef, invalidate]);

  return null;
}

/** ========= Prende o centro do GLB no mundo (remove “respiração”) ========= */
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
/** ========= Travar/destravar o ZOOM com distância calculada pelo FOV =========
 * Usa fitDist = radius / sin(fov/2) e aplica SAFE_MARGIN para garantir que
 * você não fique “dentro” do modelo quando a animação liga.
 * Move a câmera UMA VEZ (quando liga o lock), sem reposicionar mais depois.
 */
const SAFE_MARGIN = 1.4; // aumente para 1.5–1.7 se ainda quiser mais afastado

function LockOrbitZoom({
  controlsRef,
  enabledRef,
  fitRadiusRef,
}: {
  controlsRef: React.RefObject<any>;
  enabledRef: React.MutableRefObject<boolean>;
  fitRadiusRef: React.MutableRefObject<number>;
}) {
  const appliedRef = useRef<"locked" | "unlocked" | null>(null);

  useFrame(() => {
    const c = controlsRef.current;
    if (!c) return;

    if (enabledRef.current) {
      if (appliedRef.current !== "locked") {
        const cam: THREE.PerspectiveCamera = c.object;
        const t: THREE.Vector3 = c.target;

        const radius = fitRadiusRef.current || 1;
        const fovRad = (cam.fov ?? INITIAL_FOV) * (Math.PI / 180);
        const fitDist = radius / Math.sin(fovRad / 2);
        const desired = fitDist * SAFE_MARGIN;

        // distância atual e distância "segura"
        const cur = cam.position.distanceTo(t);
        const safe = Math.max(cur, desired);

        // se estiver perto demais, empurra UMA VEZ para fora
        if (cur < safe) {
          const dir = cam.position.clone().sub(t).normalize();
          cam.position.copy(t.clone().add(dir.multiplyScalar(safe)));
        }

        // trava o zoom nessa distância segura
        c.minDistance = safe;
        c.maxDistance = safe;
        c.enableZoom = false;
        cam.updateMatrixWorld();
        c.update();

        appliedRef.current = "locked";
      }
    } else {
      if (appliedRef.current !== "unlocked") {
        // libera o zoom novamente com limites razoáveis baseados na distância atual
        const cam: THREE.PerspectiveCamera = c.object;
        const dist = cam.position.distanceTo(c.target);
        c.enableZoom = true;
        c.minDistance = Math.max(0.25, dist * 0.25);
        c.maxDistance = Math.max(5, dist * 12);
        c.update();
        appliedRef.current = "unlocked";
      }
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

  // micro-translação de feedback – opcional, pode remover se quiser 100% estático
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

  // status do sistema (controla animação)
  const { snapshot } = useLive();
  const isSystemOK =
    String(snapshot?.system?.status ?? "").trim().toLowerCase() === "ok";
  const pausedFromStatus = !isSystemOK;
  const pausedEffective = (paused ?? pausedFromStatus) || showCamera;

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

  // Aplica restrições corretas ao trocar de modo
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const center = lastCenterRef.current ?? new THREE.Vector3(0, 0, 0);
    const radius = lastRadiusRef.current ?? 1;
    if (viewMode === "front") applyFrontView(c, center, radius, invalidateRef.current ?? undefined);
    else applyFreeView(c, center, invalidateRef.current ?? undefined);
  }, [viewMode]);

  // flag: animação tocando ⇒ travar zoom
  const zoomLockEnabledRef = useRef<boolean>(false);
  useEffect(() => {
    zoomLockEnabledRef.current = !pausedEffective;
  }, [pausedEffective]);

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

              {/* ⬇️ re-fit APENAS quando trocar de modelo */}
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
                    if (viewMode === "front") applyFrontView(c, center, radius, invalidateRef.current ?? undefined);
                    else applyFreeView(c, center, invalidateRef.current ?? undefined);
                  }
                }}
              />

              {/* Centro fixo para evitar “respiração” */}
              <CenterPin groupRef={groupRef} lockedCenterRef={lockedCenterRef} />

              {/* Travar o zoom (distância calculada pelo FOV + margem) */}
              <LockOrbitZoom
                controlsRef={controlsRef}
                enabledRef={zoomLockEnabledRef}
                fitRadiusRef={lastRadiusRef}
              />

              <OrbitControls
                ref={controlsRef}
                makeDefault
                enableRotate={viewMode === "free"}
                enableZoom
                enablePan={false}
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
