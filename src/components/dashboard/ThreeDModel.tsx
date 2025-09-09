import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

import { useActuatorSelection } from "@/context/ActuatorSelectionContext";
import { useLive } from "@/context/LiveContext";

// ----------------- Tipos auxiliares -----------------
type Facets = { S1?: 0 | 1; S2?: 0 | 1 };
type ActuatorSnapshot = { id: number; facets?: Facets };

// ----------------- Constantes -----------------
const MODEL_URLS: Record<1 | 2, string> = { 1: "/A1.glb", 2: "/A2.glb" };

const AXIS: "x" | "y" | "z" = "z"; // eixo da animação
const STROKE = 0.25;                // curso do pistão
const LERP = 0.18;                  // suavização (0..1)

// ----------------- Helpers -----------------
function useFitToObject() {
  const { camera } = useThree();
  // Nota: não dá para pegar o OrbitControls direto via hook;
  // se você precisar, pode ligar um ref no <OrbitControls /> e passar aqui via contexto/prop.
  return (obj: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(obj);
    if (!isFinite(box.min.x) || !isFinite(box.max.x)) return;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxSize = Math.max(size.x, size.y, size.z);
    const distance = maxSize * 2.2;

    camera.position.set(
      center.x + distance,
      center.y + distance * 0.6,
      center.z + distance
    );
    (camera as any).updateProjectionMatrix?.();
    // Se quiser recentrar o OrbitControls, passe um ref pela árvore e atualize o target lá.
  };
}

function targetFromFacets(f?: Facets): number {
  if (!f) return -1;
  const open = f.S1 === 1;
  const closed = f.S2 === 1;
  if (open && !closed) return STROKE; // avançado
  if (!open && closed) return 0;      // recuado
  return -1;                          // indeterminado (não move)
}

function findPistonNode(root: THREE.Object3D): THREE.Object3D {
  const wanted = ["piston", "pistao", "rod", "haste", "embolo", "cylinder"];
  let chosen: THREE.Object3D | null = null;
  root.traverse((o) => {
    const n = (o.name || "").toLowerCase();
    if (!chosen && wanted.some((w) => n.includes(w))) chosen = o;
  });
  return chosen || root;
}

// ----------------- Componentes -----------------
function GLBActuator({ which, facets }: { which: 1 | 2; facets?: Facets }) {
  const { scene } = useGLTF(MODEL_URLS[which]);
  const group = useRef<THREE.Group>(null);
  const pistonRef = useRef<THREE.Object3D | null>(null);
  const targetRef = useRef(-1);
  const fit = useFitToObject();

  // alvo inicial
  useEffect(() => {
    const t = targetFromFacets(facets);
    targetRef.current = t >= 0 ? t : 0;
  }, []); // intencionalmente executa uma vez

  // carrega/clona o GLB no grupo
  useEffect(() => {
    if (!scene || !group.current) return;
    const clone = scene.clone(true) as THREE.Group;
    group.current.clear();
    group.current.add(clone);
    fit(clone);
    pistonRef.current = findPistonNode(clone);
  }, [scene, fit]);

  // atualiza alvo quando mudar facets
  useEffect(() => {
    const t = targetFromFacets(facets);
    if (t >= 0) targetRef.current = t;
  }, [facets]);

  // anima a haste/pistão
  useFrame(() => {
    const p = pistonRef.current;
    if (!p) return;
    const tgt = targetRef.current;
    if (tgt < 0) return;

    if (AXIS === "z") p.position.z += (tgt - p.position.z) * LERP;
    else if (AXIS === "x") p.position.x += (tgt - p.position.x) * LERP;
    else p.position.y += (tgt - p.position.y) * LERP;
  });

  return <group ref={group} />;
}

useGLTF.preload(MODEL_URLS[1]);
useGLTF.preload(MODEL_URLS[2]);

export default function ThreeDModel() {
  const { selectedId, setSelectedId } = useActuatorSelection();
  const { snapshot } = useLive();
  const [modelIndex, setModelIndex] = useState<1 | 2>(1);

  // manter contexto de seleção sincronizado
  useEffect(() => {
    setSelectedId(modelIndex);
  }, [modelIndex, setSelectedId]);

  // ----------- A CORREÇÃO DO TS(7006) ESTÁ AQUI -----------
  const facets = useMemo(() => {
    const list = (snapshot?.actuators ?? []) as ActuatorSnapshot[];
    const a =
      list.find((a) => a.id === modelIndex) ??
      list[Number(modelIndex) - 1]; // fallback por índice (A1/A2)
    return a?.facets;
  }, [snapshot, modelIndex]);
  // --------------------------------------------------------

  return (
    <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
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
        <div className="ml-auto text-xs text-zinc-500">
          Atuador: A{selectedId} • Modo: {snapshot?.system?.mode ?? "—"}
        </div>
      </div>

      <div className="h-[420px] w-full rounded-lg overflow-hidden bg-zinc-50 dark:bg-zinc-900">
        <Canvas
          frameloop="always"
          camera={{ position: [3, 2, 5], fov: 40, near: 0.1, far: 200 }}
          gl={{ preserveDrawingBuffer: true }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 3, 3]} intensity={1} />
          <Suspense fallback={null}>
            <GLBActuator which={modelIndex} facets={facets} />
          </Suspense>
          <OrbitControls enableZoom minDistance={1.2} maxDistance={600} />
        </Canvas>
      </div>
    </div>
  );
}
