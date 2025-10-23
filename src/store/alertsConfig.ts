// src/store/alertsConfig.ts
import { useCallback, useMemo, useState } from "react";
import type { AlertsConfig } from "@/lib/api";

const LS_KEY = "alerts_config_v1";

const DEFAULT_CFG: AlertsConfig = {
  vibration_overall_threshold: 2,
  vib_green: 0.2,
  vib_amber: 0.4,
  cpm_green: 100,
  cpm_amber: 50,
  latch_timeout_factor: 1.5,
  expected_ms_A1: 0,
  expected_ms_A2: 0,
  updated_at: undefined,
};

async function apiLoad(): Promise<AlertsConfig | null> {
  try {
    const res = await fetch("/api/alerts/config", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const cfg = (await res.json()) as AlertsConfig;
    return cfg ?? null;
  } catch {
    return null;
  }
}

async function apiSave(cfg: AlertsConfig): Promise<AlertsConfig | null> {
  try {
    const res = await fetch("/api/alerts/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    if (!res.ok) throw new Error(String(res.status));
    const saved = (await res.json()) as AlertsConfig;
    return saved ?? null;
  } catch {
    return null;
  }
}

function readLS(): AlertsConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed ?? null;
  } catch {
    return null;
  }
}

function writeLS(cfg: AlertsConfig) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export function useAlertsCfg() {
  const [cfg, setCfg] = useState<AlertsConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // 1) tenta servidor
    const fromApi = await apiLoad();
    if (fromApi) {
      setCfg(fromApi);
      writeLS(fromApi);
      setLoading(false);
      return fromApi;
    }
    // 2) fallback localStorage
    const fromLS = readLS();
    if (fromLS) {
      setCfg(fromLS);
      setLoading(false);
      return fromLS;
    }
    // 3) default
    setCfg(DEFAULT_CFG);
    setLoading(false);
    return DEFAULT_CFG;
  }, []);

  const save = useCallback(async (next: AlertsConfig) => {
    // garante updated_at
    const stamped: AlertsConfig = { ...next, updated_at: new Date().toISOString() };

    // tenta servidor
    const savedServer = await apiSave(stamped);
    const finalCfg = savedServer ?? stamped;

    // sempre grava no localStorage
    writeLS(finalCfg);
    setCfg(finalCfg);
    return finalCfg;
  }, []);

  const api = useMemo(
    () => ({
      cfg,
      loading,
      load,
      save,
    }),
    [cfg, loading, load, save]
  );

  return api;
}
