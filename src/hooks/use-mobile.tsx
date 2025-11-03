// src/hooks/useIsMobile.ts
import * as React from "react";

const DEFAULT_BREAKPOINT = 768;

/**
 * Retorna true quando a viewport está abaixo do breakpoint (px).
 * - SSR-safe (não acessa window no render)
 * - Preferência: matchMedia + addEventListener("change")
 * - Fallback sem deprecation: window.resize (para browsers antigos)
 */
export function useIsMobile(breakpoint: number = DEFAULT_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return; // SSR ou ambiente sem matchMedia: mantém default
    }

    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);

    // inicial
    setIsMobile(mq.matches);

    // caminho moderno (sem warnings)
    if (typeof mq.addEventListener === "function") {
      const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }

    // fallback sem usar addListener (evita deprecation):
    // observa o resize da janela e consulta mq.matches
    const onResize = () => setIsMobile(mq.matches);
    window.addEventListener("resize", onResize);
    // dispara uma vez para garantir sync
    onResize();

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [breakpoint]);

  return isMobile;
}
