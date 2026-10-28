import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Lenis, type LenisOptions } from "../lib/lenis";

interface SmoothScrollContextValue {
  lenis: Lenis | null;
  registerScrollContainer: (element: HTMLElement | null) => void;
}

const SmoothScrollContext = createContext<SmoothScrollContextValue>({
  lenis: null,
  registerScrollContainer: () => {},
});

export interface SmoothScrollProviderProps {
  children: React.ReactNode;
  options?: Partial<LenisOptions>;
}

const DEFAULT_OPTIONS: Partial<LenisOptions> = {
  duration: 1.1,
  easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
  syncTouch: false,
  touchMultiplier: 1,
  wheelMultiplier: 1,
  autoResize: true,
};

export const SmoothScrollProvider: React.FC<SmoothScrollProviderProps> = function SmoothScrollProvider({
  children,
  options,
}) {
  const [lenisInstance, setLenisInstance] = useState<Lenis | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lenisRef = useRef<Lenis | null>(null);

  const mergedOptions = useMemo(
    () => ({
      ...DEFAULT_OPTIONS,
      ...options,
    }),
    [options]
  );
  const optionsRef = useRef(mergedOptions);
  optionsRef.current = mergedOptions;

  // Initialize and re-bind when container changes or on mount
  const initLenis = useCallback((wrapperEl?: HTMLElement | null) => {
    if (typeof window === "undefined") return;

    const targetWrapper = wrapperEl || window;

    // If instance is already active for this exact wrapper, keep it
    if (lenisRef.current && lenisRef.current.wrapper === targetWrapper) {
      return;
    }

    // Cleanup existing instance
    if (lenisRef.current) {
      lenisRef.current.destroy();
      lenisRef.current = null;
    }
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const wrapper = targetWrapper;
    const content = wrapperEl ? wrapperEl : document.documentElement;

    const instance = new Lenis({
      wrapper,
      content,
      ...optionsRef.current,
    });

    lenisRef.current = instance;
    setLenisInstance(instance);

    const onFrame = (time: number) => {
      if (lenisRef.current) {
        lenisRef.current.raf(time);
      }
      rafIdRef.current = requestAnimationFrame(onFrame);
    };

    rafIdRef.current = requestAnimationFrame(onFrame);
  }, []);

  const registerScrollContainer = useCallback(
    (element: HTMLElement | null) => {
      containerRef.current = element;
      initLenis(element);
    },
    [initLenis]
  );

  useEffect(() => {
    initLenis(containerRef.current);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (lenisRef.current) {
        lenisRef.current.destroy();
        lenisRef.current = null;
      }
    };
  }, [initLenis]);

  return (
    <SmoothScrollContext.Provider value={{ lenis: lenisInstance, registerScrollContainer }}>
      {children}
    </SmoothScrollContext.Provider>
  );
};

/**
 * Hook to access the shared Lenis smooth scroll instance
 * Optionally accepts a callback that runs on every scroll frame
 */
export function useLenis(
  callback?: (lenis: Lenis) => void,
  deps: React.DependencyList = []
): Lenis | null {
  const { lenis } = useContext(SmoothScrollContext);

  useEffect(() => {
    if (!lenis || !callback) return;
    const unsubscribe = lenis.on("scroll", () => {
      callback(lenis);
    });
    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lenis, ...deps]);

  return lenis;
}

export function useScrollContainerRegistration() {
  const { registerScrollContainer } = useContext(SmoothScrollContext);
  return registerScrollContainer;
}
