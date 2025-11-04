// src/pages/Alerts.tsx
import React, { useMemo, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import AlertsConfigSheet from "@/components/AlertsConfigSheet";
import type { AlertItem } from "@/lib/api";

/* =========================
   Utils de apresentação
   ========================= */
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

function severityLabel(n: number) {
  const clamped = clamp(Number(n) || 1, 1, 5);
  return ["Info", "Baixa", "Média", "Alta", "Crítica"][clamped - 1];
}
function severityPillClasses(n: number) {
  const base =
    "px-2.5 py-1 rounded-full text-sm md:text-base font-semibold";
  const s = clamp(Number(n) || 1, 1, 5);
  switch (s) {
    case 1:
      return `${base} bg-slate-200 text-slate-900`;
    case 2:
      return `${base} bg-emerald-200 text-emerald-900`;
    case 3:
      return `${base} bg-amber-200 text-amber-900`;
    case 4:
      return `${base} bg-orange-200 text-orange-900`;
    case 5:
      return `${base} bg-red-200 text-red-900`;
    default:
      return `${base} bg-slate-200 text-slate-900`;
  }
}

const dtf = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "medium",
});

/* =========================
   Mock de alertas (em vez do WS/HTTP)
   ========================= */
const MOCK_ALERTS: AlertItem[] = [
  {
    id: "mock-1",
    code: "A1_VIB_HIGH",
    severity: 4,
    message: "Vibração acima do limite no atuador A1",
    origin: "A1",
    created_at: new Date(Date.now() - 45000).toISOString(),
    status: "open",
  },
  {
    id: "mock-2",
    code: "A2_S1_STUCK",
    severity: 3,
    message: "Sensor S1 travado (A2)",
    origin: "A2",
    created_at: new Date(Date.now() - 120000).toISOString(),
    status: "ack",
  },
  {
    id: "mock-3",
    code: "SYS_DELAY",
    severity: 2,
    message: "Amostragem com atraso detectado",
    origin: "Sistema",
    created_at: new Date(Date.now() - 300000).toISOString(),
    status: "closed",
  },
];

const SeverityPill = React.memo(({ sev }: { sev: number }) => (
  <span className={severityPillClasses(sev)}>{severityLabel(sev)}</span>
));
SeverityPill.displayName = "SeverityPill";

const AlertRow = React.memo(function AlertRow({
  a,
  onClick,
}: {
  a: AlertItem;
  onClick: (a: AlertItem) => void;
}) {
  const abs = Date.parse(a.created_at);
  return (
    <tr
      className="border-b border-zinc-900 hover:bg-zinc-900/50 cursor-pointer"
      onClick={() => onClick(a)}
    >
      <td className="py-3 align-top text-slate-100 font-medium">
        {isNaN(abs)
          ? "—"
          : dtf.format(new Date(abs))}
      </td>
      <td className="py-3 align-top">
        <SeverityPill sev={a.severity} />
      </td>
      <td className="py-3 align-top">
        <span className="px-2.5 py-1 rounded-full text-sm font-semibold ring-1 bg-zinc-800 text-zinc-100 ring-zinc-600/40">
          {a.status ?? "open"}
        </span>
      </td>
      <td className="py-3 align-top">
        <span className="font-mono text-base text-slate-200">{a.code}</span>
      </td>
      <td className="py-3 align-top text-slate-100 text-base">
        {a.message}
      </td>
      <td className="py-3 align-top text-slate-300 text-base">
        {a.origin ?? "—"}
      </td>
    </tr>
  );
});

/* =========================
   Tabela
   ========================= */
function AlertsTable({
  items,
  onRowClick,
}: {
  items: AlertItem[];
  onRowClick: (a: AlertItem) => void;
}) {
  const rows = useMemo(
    () =>
      items.map((a) => (
        <AlertRow key={String(a.id)} a={a} onClick={onRowClick} />
      )),
    [items, onRowClick]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-3xl font-extrabold">
          Últimos alertas (mock)
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-[16px] md:text-[17px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-200">
                <th className="py-3 text-left font-semibold">Quando</th>
                <th className="py-3 text-left font-semibold">Sev.</th>
                <th className="py-3 text-left font-semibold">Status</th>
                <th className="py-3 text-left font-semibold">Código</th>
                <th className="py-3 text-left font-semibold">Mensagem</th>
                <th className="py-3 text-left font-semibold">Origem</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-slate-200"
                  >
                    Sem alertas mockados.
                  </td>
                </tr>
              ) : (
                rows
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* =========================
   Página principal (mock)
   ========================= */
const AlertsPage: React.FC = () => {
  const [items] = useState<AlertItem[]>(MOCK_ALERTS);
  const [selected, setSelected] = useState<AlertItem | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);

  const onRowClick = useCallback((a: AlertItem) => {
    setSelected(a);
    setPopupOpen(true);
  }, []);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-8 pb-12">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1>Alerts</h1>
            <p className="page-subtitle">
              Últimos alertas mockados do sistema.
            </p>
          </div>
          <AlertsConfigSheet />
        </header>

        <AlertsTable items={items} onRowClick={onRowClick} />
      </div>

      <Dialog open={popupOpen} onOpenChange={setPopupOpen}>
        <DialogContent className="sm:max-w-xl bg-slate-900 text-slate-100 border border-slate-700 text-[17px] md:text-[18px]">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-2xl md:text-3xl">
                  <span
                    className={severityPillClasses(selected.severity)}
                  >
                    {severityLabel(selected.severity)}
                  </span>
                  <span className="font-mono tracking-wide">
                    {selected.code}
                  </span>
                </DialogTitle>
                <DialogDescription className="pt-1 text-slate-200 text-lg">
                  <span className="font-semibold text-foreground">
                    {selected.message}
                  </span>
                  {selected.origin ? (
                    <span className="ml-3 opacity-80">
                      • Origem: {selected.origin}
                    </span>
                  ) : null}
                  <span className="ml-3 opacity-70">
                    {dtf.format(new Date(selected.created_at))}
                  </span>
                </DialogDescription>
              </DialogHeader>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default AlertsPage;
