// src/config/healthRules.ts
// Todos os “knobs” de severidade/erros num lugar só.

export type SystemStatus = "ok" | "degraded" | "offline" | "unknown";

export const rules = {
  // CPM (A1) → cor
  cpm: {
    greenMin: 100,   // >= 100 → verde
    amberMin: 60,    // 60..99 → âmbar; <60 → vermelho
  },

  // Quanto tempo sem evento já é preocupante?
  idle: {
    warnAfterMs: 10 * 60 * 1000, // 10 min: “preocupante”
    critAfterMs: 30 * 60 * 1000, // 30 min: “crítico”
  },

  // Mapeamento direto do status do backend
  systemToSeverity(status: SystemStatus) {
    switch (status) {
      case "ok": return "green";
      case "degraded": return "amber";
      case "offline": return "red";
      default: return "gray";
    }
  },
} as const;
