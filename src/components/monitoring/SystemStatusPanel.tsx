import React, { useMemo } from 'react';
import { useLive } from '@/context/LiveContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';

type Sev = 'operational' | 'warning' | 'down' | 'unknown';

const SEV_ORDER: Record<Sev, number> = {
  operational: 0,
  warning: 1,
  down: 2,
  unknown: 3,
};

function pill(sev: Sev) {
  const base = 'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium';
  switch (sev) {
    case 'operational':
      return { cls: `${base} bg-emerald-900/30 text-emerald-300 ring-1 ring-emerald-500/30`, icon: <CheckCircle2 className="h-4 w-4" />, label: 'Operational' };
    case 'warning':
      return { cls: `${base} bg-amber-900/30 text-amber-300 ring-1 ring-amber-500/30`, icon: <AlertTriangle className="h-4 w-4" />, label: 'Warning' };
    case 'down':
      return { cls: `${base} bg-red-900/30 text-red-300 ring-1 ring-red-500/30`, icon: <XCircle className="h-4 w-4" />, label: 'Down' };
    default:
      return { cls: `${base} bg-zinc-800 text-zinc-200 ring-1 ring-zinc-600/40`, icon: <HelpCircle className="h-4 w-4" />, label: 'Unknown' };
  }
}

/** Converte qualquer valor cru do backend para a nossa severidade */
function normalize(v: unknown): Sev {
  if (typeof v === 'boolean') return v ? 'operational' : 'down';
  if (typeof v === 'number') {
    if (v <= 0) return 'down';
    if (v === 1) return 'operational';
    return 'warning';
  }
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (['ok', 'operational', 'up', 'online', 'live', 'running', 'run'].includes(s)) return 'operational';
  if (['warn', 'warning', 'degraded', 'partial', 'maintenance'].includes(s)) return 'warning';
  if (['down', 'off', 'offline', 'stopped', 'error', 'critical', 'desligado'].includes(s)) return 'down';
  return 'unknown';
}

export default function SystemStatusPanel() {
  const { snapshot } = useLive();

  // Normaliza o objeto de componentes que vem do backend
  const components = useMemo(() => {
    const c = (snapshot as any)?.system?.components ?? {};
    return {
      conveyor: normalize(c.conveyor ?? c.conveyors ?? c.line),
      sensors: normalize(c.sensors ?? c.sensorBus),
      actuators: normalize(c.actuators ?? c.drives),
      control: normalize(c.control ?? c.controlSystem ?? c.plc),
    } as Record<'conveyor' | 'sensors' | 'actuators' | 'control', Sev>;
  }, [snapshot]);

  // Overall = pior estado entre os componentes (down > warning > operational > unknown)
  const overall: Sev = useMemo(() => {
    const list = Object.values(components);
    if (!list.length) return 'unknown';
    return list.reduce<Sev>((acc, cur) => (SEV_ORDER[cur] > SEV_ORDER[acc] ? cur : acc), 'operational');
  }, [components]);

  const Row = ({ label, sev }: { label: string; sev: Sev }) => {
    const p = pill(sev);
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="text-sm md:text-base text-zinc-300">{label}</div>
        <span className={p.cls}>{p.icon}{p.label}</span>
      </div>
    );
  };

  const overallPill = pill(overall);

  /** 
   * Mapeamento exibido (exatamente como você pediu no print):
   *  - Actuators    ← components.conveyor
   *  - Sensors      ← components.sensors
   *  - Transmition  ← components.actuators
   *  - Integration  ← components.control
   * 
   * Se quiser alinhar os nomes com as fontes reais, basta trocar a propriedade `key`.
   */
  const ROWS: Array<{ label: string; sev: Sev }> = [
    { label: 'Actuators',   sev: components.conveyor },
    { label: 'Sensors',     sev: components.sensors },
    { label: 'Transmition', sev: components.actuators },
    { label: 'Integration', sev: components.control },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-2xl md:text-3xl font-bold">System Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-sm md:text-base font-semibold text-zinc-200">Overall Status:</div>
          <div className="grid grid-cols-[1fr_auto] items-center">
            <div />
            <span className={overallPill.cls}>{overallPill.icon}{overallPill.label}</span>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div className="text-sm md:text-base font-semibold text-zinc-200">Components:</div>
          <div className="space-y-3">
            {ROWS.map((r) => (
              <Row key={r.label} label={r.label} sev={r.sev} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
