import { useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { useAlertsCfg } from "@/store/alertsConfig";
import type { AlertsConfig } from "@/lib/api";

type Props = { className?: string };

export default function AlertsConfigSheet({ className }: Props) {
  const { cfg, load, save, loading } = useAlertsCfg();
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<AlertsConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useMemo(() => JSON.stringify(cfg) !== JSON.stringify(local), [cfg, local]);

  useEffect(() => {
    if (open && !cfg) void load();
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
              <h2 className="text-2xl font-bold">Parâmetros de Alertas</h2>
              <button onClick={() => setOpen(false)} className="text-base opacity-70 hover:opacity-100">Fechar</button>
            </div>

            {!local || loading ? (
              <div>Carregando…</div>
            ) : (
              <div className="space-y-6 text-[18px]">
                <Field label="Limite de vibração (overall)" hint="Valor máximo da vibração geral (magnitude). Acima disso, gera alerta.">
                  <NumberInput value={local.vibration_overall_threshold}
                    onChange={(v)=> setLocal({ ...local, vibration_overall_threshold: v })} />
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field label="Vibração (verde)" hint="Até esse valor a vibração é considerada OK (verde).">
                    <NumberInput value={local.vib_green}
                      onChange={(v)=> setLocal({ ...local, vib_green: v })} />
                  </Field>
                  <Field label="Vibração (âmbar)" hint="Faixa de atenção (amarelo). Acima do verde e abaixo do threshold final.">
                    <NumberInput value={local.vib_amber}
                      onChange={(v)=> setLocal({ ...local, vib_amber: v })} />
                  </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field label="CPM (verde)" hint="Meta de produção (ciclos por minuto) para ficar verde.">
                    <NumberInput value={local.cpm_green}
                      onChange={(v)=> setLocal({ ...local, cpm_green: v })} />
                  </Field>
                  <Field label="CPM (âmbar)" hint="Produção mínima aceitável (amarelo). Abaixo disso pode virar vermelho.">
                    <NumberInput value={local.cpm_amber}
                      onChange={(v)=> setLocal({ ...local, cpm_amber: v })} />
                  </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Field label="Fator de timeout (×)" hint="Multiplica o tempo esperado. Ex.: 1,5 = 150%. Se exceder, alerta de TIMEOUT.">
                    <NumberInput value={local.latch_timeout_factor}
                      onChange={(v)=> setLocal({ ...local, latch_timeout_factor: v })} />
                  </Field>
                  <Field label="Tempo esperado A1 (ms)" hint="Tempo de transição esperado do atuador A1 (ms).">
                    <NumberInput value={local.expected_ms_A1 ?? 0}
                      onChange={(v)=> setLocal({ ...local, expected_ms_A1: v || null })} />
                  </Field>
                  <Field label="Tempo esperado A2 (ms)" hint="Tempo de transição esperado do atuador A2 (ms).">
                    <NumberInput value={local.expected_ms_A2 ?? 0}
                      onChange={(v)=> setLocal({ ...local, expected_ms_A2: v || null })} />
                  </Field>
                </div>

                <div className="text-sm opacity-80">
                  Atualizado em: {local.updated_at ?? "—"}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-lg font-semibold mb-2">{label}</div>
      {children}
      {hint && <div className="mt-2 text-base opacity-80 leading-snug">{hint}</div>}
      <style>{`.input{width:100%;border:1px solid rgba(255,255,255,.15);border-radius:.9rem;padding:.7rem .9rem;background:#0b1220;color:#fff;}`}</style>
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
