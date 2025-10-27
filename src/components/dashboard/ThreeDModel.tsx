// src/components/dashboard/ThreeDModel.tsx
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { Compass, Square, Video } from "lucide-react";
import { useLive } from "@/context/LiveContext";
import { useActuatorSelection } from "@/context/ActuatorSelectionContext";

/** ======= Props ======= */
export type ThreeDModelProps = { paused?: boolean };

/** ======= Constantes de câmera/fit ======= */
// Aumentamos o “afastamento”
const FIT_MULTIPLIER = 1.4;          // 2.2–3.2 deixa confortável
const INITIAL_DIR = new THREE.Vector3(1.6, 1.2, 1.8).normalize();
const INITIAL_FOV = 23;              // um pouco mais aberto ajuda
const EXTRA_FACTOR = 0.2;            // buffer extra proporcional ao raio

function getModelUrl(which: 1 | 2) {
  try {
    return new URL(`/A${which}FINALIZADO.glb`, import.meta.env.BASE_URL).pathname;
  } catch {
    return `/A${which}FINALIZADO.glb`;
  }
}

/** ======= Frames por modelo (dados do usuário) ======= */
const FRAMES: Record<1 | 2, { total: number; openEnd: number }> = {
  1: { total: 65, openEnd: 30 },
  2: { total: 73, openEnd: 30 },
};

type StableState = "RECUADO" | "AVANÇADO" | "DESCONHECIDO";

type FitResult = {
  center: THREE.Vector3;
  fitDist: number;
  radius: number;
};

/** ========= Fit util ========= */
function fitObject(
  camera: THREE.PerspectiveCamera,
  gl: THREE.WebGLRenderer,
  obj: THREE.Object3D
): FitResult {
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
  const base = radius / Math.sin(fov / 2);

  // distância confortável
  const fitDist = base * FIT_MULTIPLIER + radius * EXTRA_FACTOR;

  camera.position.copy(center.clone().add(INITIAL_DIR.clone().multiplyScalar(fitDist)));
  camera.lookAt(center);

  gl.setPixelRatio(1);

  return { center, fitDist, radius };
}

/** ========= GLB + sub-clips (abre/fecha) ========= */
function ModelAndAnim({
  which,
  paused,
  stateForThisActuator,
  controlsRef,
}: {
  which: 1 | 2;
  paused: boolean;
  stateForThisActuator: StableState | null;
  controlsRef: React.RefObject<any>;
}) {
  // preload
  useGLTF.preload(getModelUrl(1));
  useGLTF.preload(getModelUrl(2));

  const url = getModelUrl(which);
  const groupRef = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  const gltf = useGLTF(url) as any;
  const { mixer, clips } = useAnimations(gltf.animations || [], groupRef);

  // actions dos sub-clips
  const openActionRef = useRef<THREE.AnimationAction | null>(null);
  const closeActionRef = useRef<THREE.AnimationAction | null>(null);
  const lastPlayedStateRef = useRef<StableState | null>(null);

  // cria sub-clipes a partir do primeiro clip do glb + faz o fit e configura zoom
  useEffect(() => {
    if (!mixer) return;

    const base = (clips && clips[0]) as THREE.AnimationClip | undefined;
    if (!base) return;

    const { total, openEnd } = FRAMES[which];
    const fps = total / base.duration;

    const openClip = THREE.AnimationUtils.subclip(base, `OPEN_SUB_A${which}`, 0, openEnd, fps);
    const closeClip = THREE.AnimationUtils.subclip(base, `CLOSE_SUB_A${which}`, openEnd, total, fps);

    const openAction = mixer.clipAction(openClip, groupRef.current || undefined);
    const closeAction = mixer.clipAction(closeClip, groupRef.current || undefined);

    [openAction, closeAction].forEach((a) => {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.enabled = true;
      a.paused = false;
      a.time = 0;
      a.weight = 1;
      a.stop();
    });

    openActionRef.current?.stop();
    closeActionRef.current?.stop();
    openActionRef.current = openAction;
    closeActionRef.current = closeAction;
    lastPlayedStateRef.current = null;

    // Fit e configuração dinâmica do OrbitControls (target + limites de zoom)
if (groupRef.current) {
  const { center, fitDist } = fitObject(
    camera as THREE.PerspectiveCamera,
    gl as THREE.WebGLRenderer,
    groupRef.current
  );

  const controls = controlsRef.current;
  if (controls) {
    controls.target.copy(center);

    // === knobs de conforto ===
    const startDist = fitDist * 1.15; // distância inicial (1.10–1.25)
    const minDist   = fitDist * 0.65; // zoom mínimo (mais perto)
    const maxDist   = fitDist * 3.0;  // zoom máximo (mais longe)

    // posiciona a câmera exatamente na distância desejada
    const dir = new THREE.Vector3().subVectors(camera.position, center).normalize();
    camera.position.copy(center.clone().add(dir.multiplyScalar(startDist)));
    camera.updateProjectionMatrix();

    // aplica limites do OrbitControls
    controls.minDistance = Math.max(0.1, minDist);
    controls.maxDistance = Math.max(controls.minDistance + 0.01, maxDist);
    controls.enableZoom = true;
    controls.zoomSpeed = 1.0;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    controls.update();
  }
}

    return () => {
      openAction.stop();
      closeAction.stop();
      mixer.uncacheAction(openClip, groupRef.current || undefined);
      mixer.uncacheAction(closeClip, groupRef.current || undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, mixer]);

  // dispara a ação certa quando o estado (aberto/fechado) muda
  useEffect(() => {
    const openAction = openActionRef.current;
    const closeAction = closeActionRef.current;
    if (!mixer || !openAction || !closeAction) return;

    if (paused || !stateForThisActuator || stateForThisActuator === "DESCONHECIDO") {
      openAction.paused = true;
      closeAction.paused = true;
      return;
    }

    openAction.paused = false;
    closeAction.paused = false;

    if (lastPlayedStateRef.current === stateForThisActuator) return;

    openAction.stop();
    closeAction.stop();

    if (stateForThisActuator === "AVANÇADO") {
      openAction.reset();
      openAction.timeScale = 1;
      openAction.fadeIn(0.06).play();
      lastPlayedStateRef.current = "AVANÇADO";
    } else {
      closeAction.reset();
      closeAction.timeScale = 1;
      closeAction.fadeIn(0.06).play();
      lastPlayedStateRef.current = "RECUADO";
    }
  }, [paused, stateForThisActuator, mixer]);

  // avança mixer só quando não está pausado
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (mixer && !paused) mixer.update(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mixer, paused]);

  return (
    <group ref={groupRef}>
      <primitive object={gltf.scene} dispose={null} />
    </group>
  );
}

/** ======================= Componente principal ======================= */
export default function ThreeDModel({ paused }: ThreeDModelProps) {
  const { selectedId, setSelectedId } = useActuatorSelection();
  const [localIdx, setLocalIdx] = useState<1 | 2>(1);
  const which: 1 | 2 = (selectedId === 1 || selectedId === 2) ? (selectedId as 1 | 2) : localIdx;

  const { snapshot } = useLive();
  const stateForThisActuator: StableState | null = useMemo(() => {
    const a = snapshot?.actuators?.find((x) => x.id === which);
    return (a?.state as StableState) ?? null;
  }, [snapshot?.actuators, which]);

  const isSystemOK = String(snapshot?.system?.status ?? "").toLowerCase() === "ok";

  const [showCamera, setShowCamera] = useState(false);
  const effectivePaused = (paused ?? false) || !isSystemOK || showCamera;

  /** Webcam (fora do Canvas) */
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
          (videoRef.current as HTMLVideoElement).srcObject = stream;
          await (videoRef.current as HTMLVideoElement).play().catch(() => {});
        }
      } catch {
        setShowCamera(false);
      }
    };
    const close = () => {
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
      if (videoRef.current) (videoRef.current as HTMLVideoElement).srcObject = null;
    };
    if (showCamera) open();
    else close();
    return () => close();
  }, [showCamera]);

  // preload GLBs
  useEffect(() => {
    fetch(getModelUrl(1)).catch(() => {});
    fetch(getModelUrl(2)).catch(() => {});
  }, []);

  // ref para controlar zoom/target dinamicamente
  const controlsRef = useRef<any>(null);

  return (
    <div className="relative w-full rounded-2xl border border-white/10 bg-[#0a0f1a]/40 p-4">
      {/* Top tabs — usa o contexto global */}
      <div className="flex items-center gap-3 pb-3">
        <div className="inline-flex rounded-xl bg-black/30 p-1 border border-white/10">
          <button
            onClick={() => (setSelectedId ? setSelectedId(1) : setLocalIdx(1))}
            className={`px-4 py-1.5 text-sm rounded-lg transition ${
              which === 1 ? "bg-cyan-600 text-white" : "bg-transparent text-white/80 hover:text-white"
            }`}
            disabled={showCamera}
          >
            Modelo 1
          </button>
          <button
            onClick={() => (setSelectedId ? setSelectedId(2) : setLocalIdx(2))}
            className={`px-4 py-1.5 text-sm rounded-lg transition ${
              which === 2 ? "bg-cyan-600 text-white" : "bg-transparent text-white/80 hover:text-white"
            }`}
            disabled={showCamera}
          >
            Modelo 2
          </button>
        </div>
      </div>

      {/* Canvas/Webcam area */}
      <div className="relative w-full h-[460px] rounded-xl overflow-hidden border border-white/10 bg-[#111]">
        {showCamera ? (
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay />
        ) : (
          <Canvas
            frameloop="always"
            dpr={[1, 1]}
            shadows={false}
            camera={{ fov: INITIAL_FOV, position: [1.5, 1.2, 2.0] }}
            gl={{
              antialias: false,
              powerPreference: "high-performance",
              alpha: false,
              depth: true,
              stencil: false,
              preserveDrawingBuffer: false,
            }}
            onCreated={({ gl }) => {
              gl.setClearColor("#111");
              // @ts-expect-error prop existe no three moderno
              (gl as THREE.WebGLRenderer).outputColorSpace = THREE.SRGBColorSpace;
              gl.setPixelRatio(1);
            }}
          >
            <Suspense
              fallback={
                <Html>
                  <div className="text-sm text-gray-400 animate-pulse">Carregando modelo 3D...</div>
                </Html>
              }
            >
              <ambientLight intensity={0.55} />
              <directionalLight position={[5, 5, 5]} intensity={0.85} />

              <ModelAndAnim
                which={which}
                paused={effectivePaused}
                stateForThisActuator={stateForThisActuator}
                controlsRef={controlsRef}
              />

              <OrbitControls
                ref={controlsRef}
                makeDefault
                enableRotate
                enablePan={false}
                // min/maxDistance serão setados dinamicamente após o fit
                // manter enableZoom sem limites aqui
              />
            </Suspense>
          </Canvas>
        )}

        {/* Toolbar (fora do Canvas) */}
        <div className="sim-toolbar absolute left-4 bottom-4 flex items-center gap-3 pointer-events-auto">
          <button
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-base border bg-white/10 text-white border-white/20"
            disabled
          >
            <Compass size={16} /> Free View
          </button>

          <label
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-base border bg-slate-800/60 text-slate-200 border-slate-700"
            title="(travado por enquanto)"
          >
            <input type="checkbox" className="h-4 w-4 accent-cyan-500" checked={false} disabled />
            <Square size={16} /> Front View
          </label>

          <span className="text-white/40 select-none">•</span>

          <button
            onClick={() => setShowCamera((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-base border transition ${
              showCamera
                ? "bg-emerald-700 text-white border-emerald-600"
                : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500"
            }`}
          >
            <Video size={16} /> Live
          </button>
        </div>
      </div>
    </div>
  );
}
