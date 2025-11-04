// src/components/dashboard/ThreeDModel.tsx
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { Compass, Square, Video } from "lucide-react";
import { useLive } from "@/context/LiveContext";
import { useActuatorSelection } from "@/context/ActuatorSelectionContext";

/** ======= Props ======= */
export type ThreeDModelProps = {
  paused?: boolean;
  /** (Simulation) suaviza tempo do scrub por estado (1 = original; <1 mais lento) */
  simSpeed?: number;
  /** (Simulation) suaviza amortecimento (1 = original; <1 mais manteiga) */
  simLambda?: number;
  /** (Simulation) roda ciclo completo (abrir-fechar-abrir...) */
  simPlayFull?: boolean;
  /** (Simulation) velocidade do ciclo completo (fração 0..1 por segundo) */
  simCycleSpeed?: number;
};

/** ======= Constantes de câmera/fit ======= */
const FIT_MULTIPLIER = 1.4;
const INITIAL_DIR = new THREE.Vector3(1.6, 1.2, 1.8).normalize();
const INITIAL_FOV = 23;
const EXTRA_FACTOR = 0.2;

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

  const fitDist = base * FIT_MULTIPLIER + radius * EXTRA_FACTOR;

  camera.position.copy(center.clone().add(INITIAL_DIR.clone().multiplyScalar(fitDist)));
  camera.lookAt(center);

  gl.setPixelRatio(1);

  return { center, fitDist, radius };
}

/** ===== helpers de animação estável ===== */
function stateToTarget(state: StableState | null): number {
  return state === "AVANÇADO" ? 1 : 0;
}
function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** ========= GLB + scrub do tempo ========= */
function ModelAndAnim({
  which,
  paused,
  stateForThisActuator,
  controlsRef,
  speedMul,
  lambdaMul,
  playFull,
  cycleSpeed,
}: {
  which: 1 | 2;
  paused: boolean;
  stateForThisActuator: StableState | null;
  controlsRef: React.RefObject<any>;
  speedMul: number;
  lambdaMul: number;
  playFull: boolean;
  cycleSpeed: number;
}) {
  // Pré-carrega GLBs
  useGLTF.preload(getModelUrl(1));
  useGLTF.preload(getModelUrl(2));

  const url = getModelUrl(which);
  const groupRef = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  const gltf = useGLTF(url) as any;

  // mixer/clips com root no gltf.scene
  const { mixer, clips } = useAnimations(gltf.animations || [], gltf.scene);

  const baseActionRef = useRef<THREE.AnimationAction | null>(null);
  const baseDurationRef = useRef<number>(0);
  const openMaxTimeRef = useRef<number>(0);

  // alvo/posição (0..1)
  const targetRef = useRef<number>(0);
  const posRef = useRef<number>(0);

  // para ciclo completo
  const dirRef = useRef<1 | -1>(1);          // 1 = abrindo, -1 = fechando

  // cria action base, deixa timeScale=0 e faz fit/controles
  useEffect(() => {
    if (!mixer) return;

    gltf.scene.traverse((o: any) => {
      if (o && typeof o === "object") o.frustumCulled = false;
    });

    const base = (clips && clips[0]) as THREE.AnimationClip | undefined;
    if (!base) return;

    const action = mixer.clipAction(base, gltf.scene);
    action.setLoop(THREE.LoopOnce, 0);
    action.clampWhenFinished = true;
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(0);
    action.play();

    baseActionRef.current = action;
    baseDurationRef.current = base.duration;

    const { total, openEnd } = FRAMES[which];
    const framesToSec = (f: number) => (f / total) * base.duration;
    openMaxTimeRef.current = framesToSec(openEnd);

    if (groupRef.current) {
      const { center, fitDist } = fitObject(
        camera as THREE.PerspectiveCamera,
        gl as THREE.WebGLRenderer,
        groupRef.current
      );

      const controls = controlsRef.current;
      if (controls) {
        controls.target.copy(center);

        const startDist = fitDist * 1.15;
        const minDist = fitDist * 0.65;
        const maxDist = fitDist * 3.0;

        const dir = new THREE.Vector3().subVectors(camera.position, center).normalize();
        camera.position.copy(center.clone().add(dir.multiplyScalar(startDist)));
        camera.updateProjectionMatrix();

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
      try { action.stop(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, mixer]);

  // alvo estável quando estado muda (modo scrub por estado)
  useEffect(() => {
    targetRef.current = stateToTarget(stateForThisActuator ?? "DESCONHECIDO");
  }, [stateForThisActuator]);

  // tick
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = () => {
      const now = performance.now();
      const dtRaw = Math.min(0.05, (now - last) / 1000);
      last = now;

      // ajuste de tempo/lamda para simulation
      const dtAdj = dtRaw * (Number.isFinite(speedMul) ? speedMul : 1);
      const lambdaAdj = 14 * (Number.isFinite(lambdaMul) ? lambdaMul : 1);

      if (!paused && playFull) {
        // ciclo ping-pong em 0..1
        const v = Math.max(0.05, cycleSpeed); // evita travar
        posRef.current += dtAdj * v * dirRef.current as number;
        if (posRef.current >= 1) {
          posRef.current = 1;
          dirRef.current = -1;
        } else if (posRef.current <= 0) {
          posRef.current = 0;
          dirRef.current = 1;
        }

        // usa duração COMPLETA do clipe para varrer abertura+fechamento
        const fullT = baseDurationRef.current * THREE.MathUtils.clamp(posRef.current, 0, 1);
        if (mixer) {
          mixer.setTime(fullT);
          if (baseActionRef.current) baseActionRef.current.time = fullT;
          mixer.update(0);
        }
      } else {
        // modo original (scrub por estado + damping)
        const target = paused ? posRef.current : targetRef.current;
        posRef.current = damp(posRef.current, target, lambdaAdj, dtAdj);

        const t = openMaxTimeRef.current * THREE.MathUtils.clamp(posRef.current, 0, 1);
        if (mixer) {
          mixer.setTime(t);
          if (baseActionRef.current) baseActionRef.current.time = t;
          mixer.update(0);
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, mixer, speedMul, lambdaMul, playFull, cycleSpeed]);

  return (
    <group ref={groupRef}>
      <primitive object={gltf.scene} dispose={null} />
    </group>
  );
}

/** ======================= Componente principal ======================= */
function ThreeDModel({
  paused,
  simSpeed,
  simLambda,
  simPlayFull,
  simCycleSpeed,
}: ThreeDModelProps) {
  const { selectedId, setSelectedId } = useActuatorSelection();
  const [localIdx, setLocalIdx] = useState<1 | 2>(1);
  const which: 1 | 2 = (selectedId === 1 || selectedId === 2) ? (selectedId as 1 | 2) : localIdx;

  const { snapshot } = useLive();

  // Busca por id (não usar actuator_id)
  const stateForThisActuator: StableState | null = useMemo(() => {
    const a = snapshot?.actuators?.find((x) => Number((x as any).id) === which) ?? null;
    return (a?.state as StableState) ?? null;
  }, [snapshot?.actuators, which]);

  // heartbeat recente (<10s)
  const tsMs = snapshot?.ts ? Date.parse(snapshot.ts) : NaN;
  const isFresh = Number.isFinite(tsMs) ? (Date.now() - tsMs) < 10_000 : false;
  const isSystemOK = isFresh;

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

  // Detecta página /simulation para defaults suaves — Live fica intacto
  const isSimulation =
    typeof window !== "undefined" && window.location.pathname.includes("/simulation");

  const speedMul = isSimulation ? (simSpeed ?? 0.85) : 1.0;
  const lambdaMul = isSimulation ? (simLambda ?? 0.9) : 1.0;
  const playFull = isSimulation ? (simPlayFull ?? true) : false;
  const cycleSpeed = isSimulation ? (simCycleSpeed ?? 0.45) : 0.45;

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
            Atuador 1
          </button>
          <button
            onClick={() => (setSelectedId ? setSelectedId(2) : setLocalIdx(2))}
            className={`px-4 py-1.5 text-sm rounded-lg transition ${
              which === 2 ? "bg-cyan-600 text-white" : "bg-transparent text-white/80 hover:text-white"
            }`}
            disabled={showCamera}
          >
            Atuador 2
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
                speedMul={speedMul}
                lambdaMul={lambdaMul}
                playFull={playFull}
                cycleSpeed={cycleSpeed}
              />

              <OrbitControls
                ref={controlsRef}
                makeDefault
                enableRotate
                enablePan={false}
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

export default ThreeDModel;
