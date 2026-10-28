/**
 * Lenis v1.1.x compatible smooth scrolling engine
 * Restrained, enterprise-fintech calibrated physics with WCAG 2.2 prefers-reduced-motion compliance,
 * data-lenis-prevent boundary isolation, and robust React lifecycle integration.
 */

export interface LenisScrollEvent {
  scroll: number;
  limit: number;
  velocity: number;
  direction: number;
  progress: number;
}

export type LenisScrollCallback = (e: LenisScrollEvent) => void;

export interface LenisOptions {
  wrapper?: HTMLElement | Window;
  content?: HTMLElement;
  eventsTarget?: HTMLElement | Window;
  smoothWheel?: boolean;
  syncTouch?: boolean;
  syncTouchLerp?: number;
  touchInertiaMultiplier?: number;
  duration?: number;
  easing?: (t: number) => number;
  lerp?: number;
  infinite?: boolean;
  orientation?: "vertical" | "horizontal";
  gestureOrientation?: "vertical" | "horizontal" | "both";
  touchMultiplier?: number;
  wheelMultiplier?: number;
  autoResize?: boolean;
  prevent?: (node: Element) => boolean;
}

export interface ScrollToOptions {
  offset?: number;
  immediate?: boolean;
  lock?: boolean;
  duration?: number;
  easing?: (t: number) => number;
  onComplete?: () => void;
}

// Restrained fintech exponential easing: quick initial acceleration, smooth precise settling
const DEFAULT_EASING = (t: number): number => Math.min(1, 1.001 - Math.pow(2, -10 * t));

export class Lenis {
  public options: Required<LenisOptions>;
  public wrapper: HTMLElement | Window;
  public content: HTMLElement;
  public eventsTarget: HTMLElement | Window;

  public isSmooth: boolean = true;
  public isScrolling: boolean = false;
  public isStopped: boolean = false;
  public isLocked: boolean = false;

  public scroll: number = 0;
  public targetScroll: number = 0;
  public animatedScroll: number = 0;
  public velocity: number = 0;
  public direction: number = 0;
  public progress: number = 0;
  public limit: number = 0;

  private _listeners: Set<LenisScrollCallback> = new Set();
  private _resizeObserver: ResizeObserver | null = null;
  private _reducedMotionMediaQuery: MediaQueryList | null = null;
  private _isReducedMotion: boolean = false;
  private _lastTime: number = 0;
  private _onWheelHandler: (e: WheelEvent) => void;
  private _onScrollHandler: () => void;
  private _onReducedMotionChange: (e: MediaQueryListEvent) => void;
  private _scrollToAnimation: {
    from: number;
    to: number;
    duration: number;
    easing: (t: number) => number;
    startTime: number;
    onComplete?: () => void;
  } | null = null;

  constructor(options: LenisOptions = {}) {
    const isClient = typeof window !== "undefined" && typeof document !== "undefined";

    const defaultWrapper = isClient ? window : ({} as Window);
    const defaultContent = isClient ? document.documentElement : ({} as HTMLElement);

    this.wrapper = options.wrapper ?? defaultWrapper;
    this.content =
      options.content ??
      (this.wrapper === window
        ? defaultContent
        : (this.wrapper as HTMLElement));
    this.eventsTarget = options.eventsTarget ?? this.wrapper;

    this.options = {
      wrapper: this.wrapper,
      content: this.content,
      eventsTarget: this.eventsTarget,
      smoothWheel: options.smoothWheel ?? true,
      syncTouch: options.syncTouch ?? false,
      syncTouchLerp: options.syncTouchLerp ?? 0.075,
      touchInertiaMultiplier: options.touchInertiaMultiplier ?? 35,
      duration: options.duration ?? 1.1,
      easing: options.easing ?? DEFAULT_EASING,
      lerp: options.lerp ?? 0.1,
      infinite: options.infinite ?? false,
      orientation: options.orientation ?? "vertical",
      gestureOrientation: options.gestureOrientation ?? "vertical",
      touchMultiplier: options.touchMultiplier ?? 1,
      wheelMultiplier: options.wheelMultiplier ?? 1,
      autoResize: options.autoResize ?? true,
      prevent: options.prevent ?? (() => false),
    };

    this._onWheelHandler = this.onWheel.bind(this);
    this._onScrollHandler = this.onNativeScroll.bind(this);
    this._onReducedMotionChange = this.handleReducedMotionChange.bind(this);

    if (!isClient) return;

    // Check prefers-reduced-motion
    if (window.matchMedia) {
      this._reducedMotionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      this._isReducedMotion = this._reducedMotionMediaQuery.matches;
      if (this._reducedMotionMediaQuery.addEventListener) {
        this._reducedMotionMediaQuery.addEventListener("change", this._onReducedMotionChange);
      }
    }

    // Set initial scroll values
    this.scroll = this.getWrapperScroll();
    this.targetScroll = this.scroll;
    this.animatedScroll = this.scroll;
    this.resize();

    // Attach wheel listener to eventsTarget
    const target = this.eventsTarget;
    target.addEventListener("wheel", this._onWheelHandler as EventListener, { passive: false });

    // Track native scroll sync (e.g. page down, spacebar, anchor clicks)
    if (this.wrapper === window) {
      window.addEventListener("scroll", this._onScrollHandler, { passive: true });
    } else {
      (this.wrapper as HTMLElement).addEventListener("scroll", this._onScrollHandler, { passive: true });
    }

    // Setup auto-resize observer if supported
    if (this.options.autoResize && typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      if (this.content && this.content instanceof Element) {
        this._resizeObserver.observe(this.content);
      }
      if (this.wrapper !== window && (this.wrapper as Element) instanceof Element && this.wrapper !== this.content) {
        this._resizeObserver.observe(this.wrapper as Element);
      }
    }

    // Apply lenis classes
    if (document.documentElement) {
      document.documentElement.classList.add("lenis", "lenis-smooth");
    }
  }

  private handleReducedMotionChange(e: MediaQueryListEvent) {
    this._isReducedMotion = e.matches;
    if (this._isReducedMotion) {
      this.targetScroll = this.scroll;
      this.animatedScroll = this.scroll;
    }
  }

  private getWrapperScroll(): number {
    if (typeof window === "undefined") return 0;
    if (this.wrapper === window) {
      return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    }
    return (this.wrapper as HTMLElement).scrollTop || 0;
  }

  private setWrapperScroll(val: number) {
    if (typeof window === "undefined") return;
    const clamped = Math.max(0, Math.min(this.limit, val));
    if (this.wrapper === window) {
      window.scrollTo({ top: clamped, behavior: "instant" });
    } else {
      (this.wrapper as HTMLElement).scrollTop = clamped;
    }
  }

  private isElementPrevented(target: Element | null): boolean {
    if (!target) return false;
    if (this.options.prevent(target)) return true;

    let curr: Element | null = target;
    while (curr && curr !== document.body && curr !== document.documentElement) {
      if (
        curr.hasAttribute("data-lenis-prevent") ||
        curr.getAttribute("data-lenis-prevent") === "true" ||
        curr.classList.contains("lenis-prevent")
      ) {
        return true;
      }
      // Form controls and interactive textareas
      const tag = curr.tagName ? curr.tagName.toUpperCase() : "";
      if (tag === "TEXTAREA" || tag === "SELECT") {
        return true;
      }
      // Dialog / modal boundaries
      if (curr.getAttribute("role") === "dialog" || curr.getAttribute("aria-modal") === "true") {
        return true;
      }
      curr = curr.parentElement;
    }
    return false;
  }

  private onWheel(e: WheelEvent) {
    if (this.isStopped || this.isLocked) return;

    // Check if event target has data-lenis-prevent or is form/dialog boundary
    if (this.isElementPrevented(e.target as Element)) {
      return;
    }

    // Respect reduced motion
    if (this._isReducedMotion) {
      return;
    }

    if (!this.options.smoothWheel) return;

    // Normalize wheel delta (Firefox DOM_DELTA_LINE = 1, DOM_DELTA_PAGE = 2, DOM_DELTA_PIXEL = 0)
    let deltaY = e.deltaY;
    if (e.deltaMode === 1) {
      deltaY *= 40;
    } else if (e.deltaMode === 2) {
      deltaY *= window.innerHeight;
    }

    // Horizontal wheel pass-through
    if (Math.abs(e.deltaX) > Math.abs(deltaY) && this.options.orientation === "vertical") {
      return;
    }

    // Intercept scroll
    e.preventDefault();

    this.resize();
    const newTarget = this.targetScroll + deltaY * this.options.wheelMultiplier;
    this.targetScroll = Math.max(0, Math.min(this.limit, newTarget));
    this.isScrolling = true;
  }

  private onNativeScroll() {
    if (this.isScrolling) return;
    const current = this.getWrapperScroll();
    this.scroll = current;
    this.targetScroll = current;
    this.animatedScroll = current;
    this.emit();
  }

  public resize() {
    if (typeof window === "undefined") return;

    let contentHeight = 0;
    let wrapperHeight = 0;

    if (this.wrapper === window) {
      wrapperHeight = window.innerHeight;
      contentHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
    } else {
      const el = this.wrapper as HTMLElement;
      wrapperHeight = el.clientHeight;
      contentHeight =
        this.content && this.content !== el
          ? Math.max(this.content.scrollHeight, el.scrollHeight)
          : el.scrollHeight;
    }

    this.limit = Math.max(0, contentHeight - wrapperHeight);
  }

  public raf(time: number) {
    if (this.isStopped) return;

    if (!this._lastTime) this._lastTime = time;
    const deltaTime = Math.min(100, Math.max(1, time - this._lastTime));
    this._lastTime = time;

    // Handle active scrollTo animation
    if (this._scrollToAnimation) {
      const anim = this._scrollToAnimation;
      const elapsed = (time - anim.startTime) / 1000;
      const progress = Math.min(1, Math.max(0, elapsed / anim.duration));
      const easedProgress = anim.easing(progress);
      const nextScroll = anim.from + (anim.to - anim.from) * easedProgress;

      this.velocity = nextScroll - this.scroll;
      this.direction = this.velocity > 0 ? 1 : this.velocity < 0 ? -1 : 0;
      this.scroll = nextScroll;
      this.targetScroll = nextScroll;
      this.animatedScroll = nextScroll;
      this.setWrapperScroll(this.scroll);
      this.emit();

      if (progress >= 1) {
        if (anim.onComplete) anim.onComplete();
        this._scrollToAnimation = null;
        this.isScrolling = false;
      }
      return;
    }

    // If reduced motion is active, immediately align
    if (this._isReducedMotion) {
      if (this.scroll !== this.targetScroll) {
        this.scroll = this.targetScroll;
        this.animatedScroll = this.targetScroll;
        this.setWrapperScroll(this.scroll);
        this.isScrolling = false;
        this.emit();
      }
      return;
    }

    // Standard smooth interpolation
    const diff = this.targetScroll - this.animatedScroll;
    if (Math.abs(diff) > 0.5) {
      // Delta-time adjusted lerp
      const factor = 1 - Math.exp((-1 / (this.options.duration * 0.35)) * (deltaTime / 1000));
      this.animatedScroll += diff * factor;
      this.velocity = diff * factor;
      this.direction = this.velocity > 0 ? 1 : this.velocity < 0 ? -1 : 0;
      this.scroll = this.animatedScroll;
      this.setWrapperScroll(this.scroll);
      this.isScrolling = true;
      this.emit();
    } else if (this.isScrolling) {
      this.animatedScroll = this.targetScroll;
      this.scroll = this.targetScroll;
      this.setWrapperScroll(this.scroll);
      this.velocity = 0;
      this.direction = 0;
      this.isScrolling = false;
      this.emit();
    }
  }

  public scrollTo(
    target: number | string | HTMLElement,
    {
      offset = 0,
      immediate = false,
      duration = this.options.duration,
      easing = this.options.easing,
      onComplete,
    }: ScrollToOptions = {}
  ) {
    if (typeof window === "undefined") return;

    this.resize();
    let targetY = 0;

    if (typeof target === "number") {
      targetY = target;
    } else if (typeof target === "string") {
      if (target === "top") targetY = 0;
      else if (target === "bottom") targetY = this.limit;
      else {
        const el = document.querySelector(target) as HTMLElement | null;
        if (el) {
          const rect = el.getBoundingClientRect();
          const currentScroll = this.getWrapperScroll();
          targetY = rect.top + currentScroll;
        }
      }
    } else if (target instanceof HTMLElement) {
      const rect = target.getBoundingClientRect();
      const currentScroll = this.getWrapperScroll();
      targetY = rect.top + currentScroll;
    }

    targetY = Math.max(0, Math.min(this.limit, targetY + offset));

    if (immediate || this._isReducedMotion || duration === 0) {
      this._scrollToAnimation = null;
      this.scroll = targetY;
      this.targetScroll = targetY;
      this.animatedScroll = targetY;
      this.setWrapperScroll(targetY);
      this.isScrolling = false;
      this.emit();
      if (onComplete) onComplete();
      return;
    }

    this.isScrolling = true;
    this._scrollToAnimation = {
      from: this.scroll,
      to: targetY,
      duration: Math.max(0.1, duration),
      easing,
      startTime: performance.now(),
      onComplete,
    };
  }

  public on(event: "scroll", callback: LenisScrollCallback): () => void {
    if (event === "scroll") {
      this._listeners.add(callback);
    }
    return () => this.off(event, callback);
  }

  public off(event: "scroll", callback: LenisScrollCallback): void {
    if (event === "scroll") {
      this._listeners.delete(callback);
    }
  }

  private emit() {
    this.progress = this.limit > 0 ? Math.min(1, Math.max(0, this.scroll / this.limit)) : 0;
    const evt: LenisScrollEvent = {
      scroll: this.scroll,
      limit: this.limit,
      velocity: this.velocity,
      direction: this.direction,
      progress: this.progress,
    };
    for (const listener of this._listeners) {
      listener(evt);
    }
  }

  public start() {
    this.isStopped = false;
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.classList.remove("lenis-stopped");
    }
  }

  public stop() {
    this.isStopped = true;
    this.isScrolling = false;
    this._scrollToAnimation = null;
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.classList.add("lenis-stopped");
    }
  }

  public destroy() {
    this.stop();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._reducedMotionMediaQuery && this._reducedMotionMediaQuery.removeEventListener) {
      this._reducedMotionMediaQuery.removeEventListener("change", this._onReducedMotionChange);
    }
    if (typeof window !== "undefined") {
      const target = this.eventsTarget;
      if (target && target.removeEventListener) {
        target.removeEventListener("wheel", this._onWheelHandler as EventListener);
      }
      if (this.wrapper === window) {
        window.removeEventListener("scroll", this._onScrollHandler);
      } else if (this.wrapper && (this.wrapper as HTMLElement).removeEventListener) {
        (this.wrapper as HTMLElement).removeEventListener("scroll", this._onScrollHandler);
      }
    }
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.classList.remove("lenis", "lenis-smooth", "lenis-stopped");
    }
    this._listeners.clear();
  }
}

export default Lenis;
