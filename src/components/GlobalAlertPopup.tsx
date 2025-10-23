import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// ===== Tipos que já usamos em /alerts.tsx =====
export type AlertItem = {
  id: string | number;
  code: string;
  severity: number;
  message: string;
  origin?: string | null;
  created_at: string;
  status?: string;
  causes?: string[];
  recommendations?: string[];
};

// ===== Throttle de 10s por alerta (assinatura code|origin) =====
const THROTTLE_MS = 10_000;
const lastShownAt = new Map<string, number>();

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const severityLabel = (n: number) => ["Info", "Baixa", "Média", "Alta", "Crítica"][clamp(Number(n) || 1, 1, 5) - 1];
const pill = (sev: number) => {
  const base = "px-2.5 py-1 rounded-full text-sm md:text-base font-semibold";
  const s = clamp(Number(sev) || 1, 1, 5);
  if (s === 5) return `${base} bg-red-200 text-red-900`;
  if (s === 4) return `${base} bg-orange-200 text-orange-900`;
  if (s === 3) return `${base} bg-amber-200 text-amber-900`;
  if (s === 2) return `${base} bg-emerald-200 text-emerald-900`;
  return `${base} bg-slate-200 text-slate-900`;
};
const dtf = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" });

// ===== Evento global =====
const EVT = "iot:new-alert";

export function emitGlobalAlert(a: AlertItem) {
  const sig = `${a.code}|${a.origin ?? ""}`;
  const now = Date.now();
  const last = lastShownAt.get(sig) ?? 0;
  if (now - last < THROTTLE_MS) return; // em castigo
  lastShownAt.set(sig, now);
  window.dispatchEvent(new CustomEvent(EVT, { detail: a }));
}

export default function GlobalAlertPopup() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AlertItem | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const handler = (e: Event) => {
      const any = e as CustomEvent<AlertItem>;
      if (!mounted.current) return;
      setData(any.detail);
      setOpen(true);
    };
    window.addEventListener(EVT, handler);
    return () => {
      mounted.current = false;
      window.removeEventListener(EVT, handler);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-xl bg-slate-900 text-slate-100 border border-slate-700 text-[17px] md:text-[18px]">
        {data && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-2xl md:text-3xl">
                <span className={pill(data.severity)}>{severityLabel(data.severity)}</span>
                <span className="font-mono tracking-wide">{data.code}</span>
              </DialogTitle>
              <DialogDescription className="pt-1 text-slate-200 text-lg">
                <span className="font-semibold text-foreground">{data.message}</span>
                {data.origin ? <span className="ml-3 opacity-80">• Origem: {data.origin}</span> : null}
                <span className="ml-3 opacity-70">{dtf.format(new Date(data.created_at))}</span>
              </DialogDescription>
            </DialogHeader>

            {!!data.causes?.length && (
              <div className="mt-3">
                <div className="text-lg font-semibold mb-1">Possíveis causas</div>
                <ul className="list-disc pl-5 space-y-1 text-base">
                  {data.causes.map((c, i) => <li key={`c-${i}`}>{c}</li>)}
                </ul>
              </div>
            )}

            {!!data.recommendations?.length && (
              <div className="mt-4">
                <div className="text-lg font-semibold mb-1">O que fazer agora</div>
                <ul className="list-disc pl-5 space-y-1 text-base">
                  {data.recommendations.map((r, i) => <li key={`r-${i}`}>{r}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
