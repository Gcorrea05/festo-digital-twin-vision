// src/components/dashboard/LiveMetrics.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLive } from "@/context/LiveContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  getSystem,
  getLiveActuatorsState,
  getCpmByActuator,
} from "@/lib/api";

type Stable = "AVANÇADO" | "RECUADO";

type SnapshotActuator = {
  id: number;
  facets?: { S1?: boolean; S2?: boolean };
  cpm?: number;
};

type SnapshotShape = {
  ts: number;
  system: { status: "OK" | "OFFLINE" | string };
  actuators: SnapshotActuator[];
  // ⬇️ aceita null também
  mpu?: { ax: number; ay: number; az: number } | null;
};

function computeStable(a?: { facets?: { S1?: boolean; S2?: boolean } }): Stable | null {
  if (!a?.facets) return null;
  if (a.facets.S2) return "AVANÇADO";
  if (a.facets.S1) return "RECUADO";
  return null; // transição
}

function parseActuatorId(x: string | number): number {
  if (typeof x === "number") return x;
  const m = String(x).match(/\d+/);
  return m ? parseInt(m[0], 10) : NaN;
}

const POLL_MS = 1500;

const LiveMetrics: React.FC = () => {
  const { snapshot: snapshotCtx } = useLive();

  const [snapshotLocal, setSnapshotLocal] = useState<SnapshotShape | null>(null);
  const lastCpmRef = useRef<Record<number, number>>({});
  const [lastStable, setLastStable] = useState<Record<number, Stable>>({});

  useEffect(() => {
    let stop = false;

    const tick = async () => {
      try {
        const sys = await getSystem();
        const status = sys.mode === "ONLINE" ? "OK" : "OFFLINE";

        const live = await getLiveActuatorsState();

        const mapped: SnapshotActuator[] = (live?.actuators ?? []).map((it: any) => {
          const id = parseActuatorId(it.actuator_id ?? it.id ?? "");
          return {
            id: Number.isFinite(id) ? id : 0,
            facets: {
              S1: it.recuado === 1 || it.recuado === true,
              S2: it.avancado === 1 || it.avancado === true,
            },
            cpm: lastCpmRef.current[id] ?? 0,
          };
        });

        // CPM opcional (não bloqueia UI)
        Promise.all(
          mapped.map(async (a) => {
            if (!a.id) return;
            try {
              const r = await getCpmByActuator(a.id as 1 | 2, 60);
              lastCpmRef.current[a.id] = r?.cpm ?? 0;
            } catch {}
          })
        ).catch(() => {});

        if (!stop) {
          const newSnap: SnapshotShape = {
            ts: Date.now(),
            system: { status },
            actuators: mapped.map((a) => ({ ...a, cpm: lastCpmRef.current[a.id] ?? a.cpm ?? 0 })),
          };
          setSnapshotLocal(newSnap);
        }
      } catch {
      } finally {
        if (!stop) setTimeout(tick, POLL_MS);
      }
    };

    tick();
    return () => {
      stop = true;
    };
  }, []);

  // fonte preferencial: contexto; fallback: polling local
  const snapshot: SnapshotShape | null = useMemo(() => {
    if (snapshotCtx?.actuators) {
      const mapped: SnapshotActuator[] = (snapshotCtx.actuators ?? []).map((a: any) => ({
        id: a.id ?? parseActuatorId(a.actuator_id ?? ""),
        facets: a.facets ?? {
          S1: !!a.recuado || a.state === "RECUADO",
          S2: !!a.avancado || a.state === "AVANÇADO",
        },
        cpm: a.cpm ?? 0,
      }));

      // ⬇️ normaliza mpu para {ax,ay,az} ou null
      const mpuNorm =
        snapshotCtx.mpu
          ? { ax: snapshotCtx.mpu.ax, ay: snapshotCtx.mpu.ay, az: snapshotCtx.mpu.az }
          : null;

      return {
        ts: Date.now(),
        system: { status: (snapshotCtx.system?.status ?? "OK") as any },
        actuators: mapped,
        mpu: mpuNorm,
      };
    }
    return snapshotLocal;
  }, [snapshotCtx, snapshotLocal]);

  useEffect(() => {
    if (!snapshot?.actuators) return;

    setLastStable((prev) => {
      const next: Record<number, Stable> = { ...prev };

      (snapshot.actuators ?? []).forEach((a) => {
        if (a?.id != null && next[a.id] == null) next[a.id] = "RECUADO";
      });

      (snapshot.actuators ?? []).forEach((a) => {
        const st = computeStable(a);
        if (st && a?.id != null) next[a.id] = st;
      });

      return next;
    });
  }, [snapshot?.ts, snapshot?.actuators]);

  const totalCpm = useMemo(
    () => (snapshot?.actuators ?? []).reduce((acc, a) => acc + (a.cpm || 0), 0),
    [snapshot?.actuators]
  );

  if (!snapshot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Live Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Aguardando dados do backend...
          </p>
        </CardContent>
      </Card>
    );
  }

  const getDisplayState = (a: SnapshotActuator): Stable => {
    const st = computeStable(a);
    return st ?? lastStable[a.id] ?? "RECUADO";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Metrics</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">System</p>
          <p className="text-lg font-bold">
            {String(snapshot.system.status).toUpperCase()}
          </p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Total CPM</p>
          <p className="text-lg font-bold">{totalCpm}</p>
        </div>

        <div className="sm:col-span-3">
          <p className="text-sm text-muted-foreground">Actuators</p>
          <ul className="text-sm space-y-1">
            {(snapshot.actuators ?? []).map((a) => (
              <li key={a.id}>
                AT{a.id}: {getDisplayState(a)} — {a.cpm ?? 0} CPM
              </li>
            ))}
          </ul>
        </div>

        {snapshot.mpu && (
          <div className="sm:col-span-3">
            <p className="text-sm text-muted-foreground">MPU</p>
            <p className="text-xs">
              ax: {snapshot.mpu.ax.toFixed(2)} | ay: {snapshot.mpu.ay.toFixed(2)} | az:{" "}
              {snapshot.mpu.az.toFixed(2)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LiveMetrics;
