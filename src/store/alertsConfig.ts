import { create } from "zustand";
import { getAlertsConfig, updateAlertsConfig, type AlertsConfig } from "@/lib/api";

type CfgState = {
  cfg: AlertsConfig | null;
  loading: boolean;
  error?: string;

  load(): Promise<void>;
  save(patch: Partial<AlertsConfig>): Promise<AlertsConfig | null>;
  setLocal(updater: (c: AlertsConfig) => AlertsConfig): void;
};

export const useAlertsCfg = create<CfgState>((set, get) => ({
  cfg: null,
  loading: false,
  error: undefined,

  load: async () => {
    set({ loading: true, error: undefined });
    try {
      const cfg = await getAlertsConfig();
      set({ cfg, loading: false });
    } catch (e: any) {
      set({ loading: false, error: String(e?.message || e || "Falha ao carregar configuração") });
    }
  },

  save: async (patch) => {
    set({ loading: true, error: undefined });
    try {
      const next = await updateAlertsConfig(patch);
      set({ cfg: next, loading: false });
      return next;
    } catch (e: any) {
      set({ loading: false, error: String(e?.message || e || "Falha ao salvar configuração") });
      return null;
    }
  },

  setLocal: (updater) => {
    const curr = get().cfg;
    if (!curr) return;
    const next = updater(curr);
    set({ cfg: next });
  },
}));
