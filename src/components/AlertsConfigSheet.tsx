import { useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { useAlertsCfg } from "@/store/alertsConfig";
import type { AlertsConfig } from "@/lib/api";

// Se você usar shadcn/ui, descomente estes imports e troque os wrappers base:
// import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";

type Props = { className?: string };

export default function AlertsConfigSheet({ className }: Props) {
  const { cfg, load, save, loading } = useAlertsCfg();
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<AlertsConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useMemo(() => JSON.stringify(cfg) !== JSON.stringify(local), [cfg, local]);

  useEffect(() => {
    if (!cfg && open) load();
  }, [open, cfg, load]);

  useEffect(() => {
    if (cfg) setLocal(cfg);
  }, [cfg, open]);

  const onSave = async () => {
    if (!local) return;
    setSaving(true);
    const next = await save(local);
    setSaving(false);
    if (next) setOpen(false);
  };

  // wrappers simples (sem shadcn). Troque por Sheet/Button/Input se quiser.
  return (
    <div className={className}>
      <button
        onClick={() => setOpen(true)}
        title="Configurar parâmetros de alertas"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/60"
      >
        <Settings2 className="w-4 h-4" />
        <span className="text-sm">Config</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-zinc-900 shadow-2xl p-5 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Parâmetros de Alertas</h2>
              <button onClick={() => setOpen(false)} className="text-sm opacity-70 hover:opacity-100">Fechar</button>
            </div>

            {!local || loading ? (
              <div>Carregando…</div>
            ) : (
              <div className="space-y-5">
                <Field label="Vibration overall threshold">
                  <NumberInput value={local.vibration_overall_threshold}
                    onChange={(v)=> setLocal({ ...local, vibration_overall_threshold: v })} />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="VIB green">
                    <NumberInput value={local.vib_green}
                      onChange={(v)=> setLocal({ ...local, vib_green: v })} />
                  </Field>
                  <Field label="VIB amber">
                    <NumberInput value={local.vib_amber}
                      onChange={(v)=> setLocal({ ...local, vib_amber: v })} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="CPM green">
                    <NumberInput value={local.cpm_green}
                      onChange={(v)=> setLocal({ ...local, cpm_green: v })} />
                  </Field>
                  <Field label="CPM amber">
                    <NumberInput value={local.cpm_amber}
                      onChange={(v)=> setLocal({ ...local, cpm_amber: v })} />
                  </Field>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <Field label="Latch timeout factor">
                    <NumberInput value={local.latch_timeout_factor}
                      onChange={(v)=> setLocal({ ...local, latch_timeout_factor: v })} />
                  </Field>
                  <Field label="Expected A1 (ms)">
                    <NumberInput value={local.expected_ms_A1 ?? 0}
                      onChange={(v)=> setLocal({ ...local, expected_ms_A1: v || null })} />
                  </Field>
                  <Field label="Expected A2 (ms)">
                    <NumberInput value={local.expected_ms_A2 ?? 0}
                      onChange={(v)=> setLocal({ ...local, expected_ms_A2: v || null })} />
                  </Field>
                </div>

                <div className="text-xs opacity-70">
                  Última atualização: {local.updated_at ?? "—"}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    disabled={!dirty || saving}
                    onClick={onSave}
                    className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
                  >
                    {saving ? "Salvando…" : "Salvar"}
                  </button>
                  <button
                    onClick={() => setLocal(cfg!)}
                    disabled={!dirty || saving}
                    className="px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
                  >
                    Descartar alterações
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide mb-1 opacity-70">{label}</div>
      {children}
      <style>{`.input{width:100%;border:1px solid rgba(0,0,0,.12);border-radius:.75rem;padding:.5rem .75rem;background:transparent}`}</style>
    </label>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      className="input"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}
