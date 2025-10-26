// src/components/dashboard/ThreeDModel.tsx
import React, { Suspense, useEffect, useRef, useState, useCallback, memo } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { Compass, Square, Video } from "lucide-react";
import { useLive } from "@/context/LiveContext";

/** ======= Props ======= */
export type ThreeDModelProps = { paused?: boolean };

/** ======= Constantes de câmera/fit ======= */
const FIT_MULTIPLIER = 1.0;
const INITIAL_DIR = new THREE.Vector3(1.6, 1.2, 1.8).normalize();
const INITIAL_FOV = 20;
const ZOOM_MIN_FACTOR = 0.85;
const ZOOM_MAX_FACTOR = 6.0;

function getModelUrl(which: 1 | 2) {
  try { return new URL(`/A${which}FINALIZADO.glb`, import.meta.env.BASE_URL).pathname; }
  catch { return `/A${which}FINALIZADO.glb`; }
}

/** ========= Utils de camera ========= */
function applyFrontView(controls: any, center: THREE.Vector3, radius: number) {
  const camera = controls.object as THREE.PerspectiveCamera;
  const fov = (camera.fov ?? INITIAL_FOV) * (Math.PI / 180);
  const fitDist = radius / Math.sin(fov / 2);
  camera.position.set(center.x, center.y, center.z + fitDist * FIT_MULTIPLIER);
  controls.target.copy(center);
  controls.enableRotate = false;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.minDistance = fitDist * ZOOM_MIN_FACTOR;
  controls.maxDistance = fitDist * ZOOM_MAX_FACTOR;
  controls.update();
}

function applyFreeView(controls: any, center?: THREE.Vector3, fitRadius?: number) {
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
  if (fitRadius && (controls.object as THREE.PerspectiveCamera)) {
    const cam: THREE.PerspectiveCamera = controls.object;
    const fov = (cam.fov ?? INITIAL_FOV) * (Math.PI / 180);
    const fitDist = fitRadius / Math.sin(fov / 2);
    controls.minDistance = fitDist * ZOOM_MIN_FACTOR;
    controls.maxDistance = fitDist * ZOOM_MAX_FACTOR;
  }
  controls.update();
}

/** ========= AutoFit (uma vez por troca de modelo) ========= */
function AutoFit({
  groupRef,
  onFit,
  staticNodeNames = ["Base", "Frame", "Body"],
}: {
  groupRef: React.RefObject<THREE.Group>;
  onFit?: (center: THREE.Vector3, radius: number) => void;
  staticNodeNames?: (string | undefined)[];
}) {
  const { camera, gl } = useThree() as any;

  const doFit = useCallback(() => {
    const obj = groupRef.current;
    if (!obj) return;

    // procura nó fixo do chassi
    const names = (staticNodeNames ?? []).filter((n): n is string => typeof n === "string" && n.length > 0);
    let staticNode: THREE.Object3D | null = null;
    for (const n of names) { const found = obj.getObjectByName(n); if (found) { staticNode = found; break; } }
    if (!staticNode) staticNode = obj;

    const box = new THREE.Box3().setFromObject(staticNode);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center); box.getSize(size);

    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;

    camera.near = Math.max(0.01, radius / 50);
    camera.far = radius * 100;
    camera.fov = INITIAL_FOV;
    camera.updateProjectionMatrix();

    const fov = (camera.fov ?? INITIAL_FOV) * (Math.PI / 180);
    const fitDist = radius / Math.sin(fov / 2);

    camera.position.copy(center.clone().add(INITIAL_DIR.clone().multiplyScalar(fitDist * FIT_MULTIPLIER)));

    gl.setPixelRatio(1); // previsível
    onFit?.(center, radius);
  }, [camera, gl, groupRef, onFit, staticNodeNames]);

  useEffect(() => { doFit(); }, [doFit]);
  return null;
}

/** ========= GLB + animação (usa ref p/ paused) ========= */
function GLBActuator({
  which, groupRef, pausedRef, requestFrameRef,
}: {
  which: 1 | 2;
  groupRef: React.RefObject<THREE.Group>;
  pausedRef: React.MutableRefObject<boolean>;
  requestFrameRef: React.MutableRefObject<(() => void) | null>;
}) {
  const url = getModelUrl(which);
  useGLTF.preload(getModelUrl(1));
  useGLTF.preload(getModelUrl(2));

  let gltf: { scene: THREE.Object3D; animations?: THREE.AnimationClip[] } | null = null;
  try { gltf = useGLTF(url, true) as any; } catch { gltf = null; }

  const localRef = useRef<THREE.Group>(null);
  const { actions, names, mixer } = useAnimations(gltf?.animations || [], localRef);

  useEffect(() => {
    if (!actions || !names) return;
    names.forEach((n) => actions[n]?.stop());
    names.forEach((n) => {
      const a = actions[n];
      if (a) { a.reset(); a.clampWhenFinished = false; a.setLoop(THREE.LoopRepeat, Infinity); a.play(); }
    });
    return () => names.forEach((n) => actions[n]?.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, actions, names]);

  // avança mixer com delta estável; lê paused via ref (não re-renderiza)
  useFrame((state) => {
    if (!mixer || pausedRef.current) return;
    const rawDt = state.clock.getDelta();
    const dt = Math.max(rawDt, 1 / 120); // mínimo de ~8ms; sem upper clamp
    mixer.update(dt);
    requestFrameRef.current?.(); // força um redraw
  });

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

/** ========= Sub-árvore do Canvas (memorizada p/ não re-renderizar) ========= */
const Scene = memo(function Scene({
  modelIndexRef,
  viewModeRef,
  pausedRef,
  requestFrameRef,
}: {
  modelIndexRef: React.MutableRefObject<1 | 2>;
  viewModeRef: React.MutableRefObject<"free" | "front">;
  pausedRef: React.MutableRefObject<boolean>;
  requestFrameRef: React.MutableRefObject<(() => void) | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const lastCenterRef = useRef<THREE.Vector3 | null>(null);
  const lastRadiusRef = useRef<number>(1);

  // instala listeners do controls apenas 1x
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    let raf = 0;
    const pump = () => { requestFrameRef.current?.(); raf = requestAnimationFrame(pump); };
    const onStart = () => { requestFrameRef.current?.(); pump(); };
    const onEnd = () => { cancelAnimationFrame(raf); requestFrameRef.current?.(); };
    c.addEventListener("start", onStart);
    c.addEventListener("end", onEnd);
    c.addEventListener("change", () => requestFrameRef.current?.());
    return () => {
      c.removeEventListener("start", onStart);
      c.removeEventListener("end", onEnd);
      c.removeEventListener("change", () => requestFrameRef.current?.());
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <Suspense fallback={<Html><div className="text-sm text-gray-400 animate-pulse">Carregando modelo 3D...</div></Html>}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />

        <group ref={groupRef}>
          <GLBActuator
            which={modelIndexRef.current}
            groupRef={groupRef}
            pausedRef={pausedRef}
            requestFrameRef={requestFrameRef}
          />
        </group>

        {/* fit 1x quando o modelo muda (forçamos remount trocando key) */}
        <AutoFit
          key={modelIndexRef.current}
          groupRef={groupRef}
          onFit={(center, radius) => {
            lastCenterRef.current = center.clone();
            lastRadiusRef.current = radius;

            const c = controlsRef.current;
            if (c) {
              c.target.copy(center);
              const cam: THREE.PerspectiveCamera = c.object;
              const fov = (cam.fov ?? INITIAL_FOV) * (Math.PI / 180);
              const fitDist = radius / Math.sin(fov / 2);
              c.minDistance = fitDist * ZOOM_MIN_FACTOR;
              c.maxDistance = fitDist * ZOOM_MAX_FACTOR;

              // aplica modo atual sem re-render
              if (viewModeRef.current === "front") applyFrontView(c, center, radius);
              else applyFreeView(c, center, radius);
              c.update();
              requestFrameRef.current?.();
            }
          }}
        />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableRotate={viewModeRef.current === "free"}
          enableZoom
          enablePan={false}
          mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        />
      </Suspense>
    </>
  );
});

/** ======================= Componente principal ======================= */
export default function ThreeDModel({ paused }: ThreeDModelProps) {
  // estado de UI fora do Canvas
  const [modelIndex, setModelIndex] = useState<1 | 2>(1);
  const [viewMode, setViewMode] = useState<"free" | "front">("free");
  const [showCamera, setShowCamera] = useState(false);

  const { snapshot } = useLive();
  const currentId: 1 | 2 | undefined = (snapshot?.selectedActuator as 1 | 2 | undefined) ?? modelIndex;
  const currentAct = snapshot?.actuators?.find((a) => a.id === currentId);
  const hasStarted = Boolean(currentAct?.hasStarted);
  const isSystemOK = String(snapshot?.system?.status ?? "").trim().toLowerCase() === "ok";

  // —— refs que alimentam a cena sem re-render
  const pausedRef = useRef(false);
  const modelIndexRef = useRef<1 | 2>(1);
  const viewModeRef = useRef<"free" | "front">("free");
  const requestFrameRef = useRef<(() => void) | null>(null);

  // mantém as refs em sincronia, sem re-renderizar o <Canvas>
  useEffect(() => {
    modelIndexRef.current = modelIndex;
    requestFrameRef.current?.();
  }, [modelIndex]);
  useEffect(() => {
    viewModeRef.current = viewMode;
    requestFrameRef.current?.();
  }, [viewMode]);
  useEffect(() => {
    const effective = (paused ?? (!isSystemOK || !hasStarted)) || showCamera;
    pausedRef.current = !!effective;
  }, [paused, isSystemOK, hasStarted, showCamera]);

  // preload GLB
  useEffect(() => { fetch(getModelUrl(modelIndex)).catch(() => {}); }, [modelIndex]);

  /** Webcam (fora do Canvas) */
  const videoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "hidden") setShowCamera(false); };
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
    if (showCamera) open(); else close();
    return () => close();
  }, [showCamera]);

  return (
    <div className="relative w-full rounded-2xl border border-white/10 bg-[#0a0f1a]/40 p-4">
      {/* Top tabs */}
      <div className="flex items-center gap-3 pb-3">
        <div className="inline-flex rounded-xl bg-black/30 p-1 border border-white/10">
          <button
            onClick={() => setModelIndex(1)}
            className={`px-4 py-1.5 text-sm rounded-lg transition ${modelIndex === 1 ? "bg-cyan-600 text-white" : "bg-transparent text-white/80 hover:text-white"}`}
            disabled={showCamera}
          >Modelo 1</button>
          <button
            onClick={() => setModelIndex(2)}
            className={`px-4 py-1.5 text-sm rounded-lg transition ${modelIndex === 2 ? "bg-cyan-600 text-white" : "bg-transparent text-white/80 hover:text-white"}`}
            disabled={showCamera}
          >Modelo 2</button>
        </div>
      </div>

      {/* Canvas/Webcam area */}
      <div className="relative w-full h-[460px] rounded-xl overflow-hidden border border-white/10 bg-[#111]">
        {showCamera ? (
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay />
        ) : (
          <Canvas
            frameloop="always"                 // 🔧 loop contínuo (suavidade máxima)
            dpr={[1, 1]}                       // 🔧 custo previsível
            shadows={false}
            camera={{ fov: INITIAL_FOV, position: [1.5, 1.2, 2.0] }}
            gl={{ antialias: false, powerPreference: "high-performance", alpha: false, depth: true, stencil: false, preserveDrawingBuffer: false }}
            onCreated={({ gl, invalidate }) => {
              gl.setClearColor("#111");
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.setPixelRatio(1);
              // expõe um requestFrame p/ fora
              requestFrameRef.current = () => invalidate();
            }}
          >
            <Suspense fallback={<Html><div className="text-sm text-gray-400 animate-pulse">Carregando modelo 3D...</div></Html>}>
              <Scene
                modelIndexRef={modelIndexRef}
                viewModeRef={viewModeRef}
                pausedRef={pausedRef}
                requestFrameRef={requestFrameRef}
              />
            </Suspense>
          </Canvas>
        )}

        {/* Toolbar */}
        <div className="sim-toolbar absolute left-4 bottom-4 flex items-center gap-3">
          <button
            onClick={() => setViewMode("free")}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-base border transition
              ${viewMode === "free" ? "bg-white/10 text-white border-white/20" : "bg-slate-800/60 text-slate-200 border-slate-700 hover:bg-slate-800"}`}
            disabled={showCamera}
          ><Compass size={16} /> Free View</button>

          <label
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-base border transition
              ${viewMode === "front" ? "bg-white/10 text-white border-white/20" : "bg-slate-800/60 text-slate-200 border-slate-700 hover:bg-slate-800"}`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-cyan-500"
              checked={viewMode === "front"}
              onChange={() => setViewMode((m) => (m === "front" ? "free" : "front"))}
              disabled={showCamera}
            />
            <Square size={16} /> Front View
          </label>

          <span className="text-white/40 select-none">•</span>

          <button
            onClick={() => setShowCamera((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-base border transition
              ${showCamera ? "bg-emerald-700 text-white border-emerald-600" : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500"}`}
          ><Video size={16} /> Live</button>
        </div>
      </div>
    </div>
  );
}
