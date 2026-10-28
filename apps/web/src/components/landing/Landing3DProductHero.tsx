import { useState, useRef, useEffect, useCallback, type MouseEvent, type TouchEvent } from "react";
import * as THREE from "three";
import {
  FileCode2,
  ShieldAlert,
  Lock,
  Zap,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Activity,
  Layers,
  Terminal,
} from "lucide-react";
import { VorentBrandMark } from "../navigation/Sidebar";

export interface Landing3DProductHeroProps {
  onLaunchConsole?: (workstation?: string) => void;
  onExploreFeatures?: () => void;
}

export function Landing3DProductHero({
  onLaunchConsole,
  onExploreFeatures,
}: Landing3DProductHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [rotate, setRotate] = useState({ x: 8, y: -12 });
  const [isInteracting, setIsInteracting] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Responsive mobile viewport check
  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Check WCAG prefers-reduced-motion
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);

    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  // Three.js Ambient Particle Light Canvas behind the 3D Stage
  useEffect(() => {
    if (prefersReducedMotion) return;
    const container = canvasContainerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    const width = container.clientWidth || 580;
    const height = container.clientHeight || 460;

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 8);

    // Dynamic light tracking the 3D stage
    const pointLight = new THREE.PointLight(0x0ea5e9, 2.5, 20);
    pointLight.position.set(0, 1, 4);
    scene.add(pointLight);

    const cyanLight = new THREE.PointLight(0x38bdf8, 1.8, 15);
    cyanLight.position.set(-3, -2, 3);
    scene.add(cyanLight);

    const ambientLight = new THREE.AmbientLight(0x080b11, 0.8);
    scene.add(ambientLight);

    // Orbital 3D Particle Constellation
    const particleCount = 72;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const colorElectric = new THREE.Color(0x0ea5e9);
    const colorTeal = new THREE.Color(0x38bdf8);
    const colorWhite = new THREE.Color(0xf8fafc);

    for (let i = 0; i < particleCount; i++) {
      const radius = 2.4 + Math.random() * 2.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.8;

      positions[i * 3] = radius * Math.cos(theta) * Math.cos(phi);
      positions[i * 3 + 1] = radius * Math.sin(phi);
      positions[i * 3 + 2] = radius * Math.sin(theta) * Math.cos(phi) - 1.0;

      const mixedColor = i % 3 === 0 ? colorElectric : i % 3 === 1 ? colorTeal : colorWhite;
      colors[i * 3] = mixedColor.r;
      colors[i * 3 + 1] = mixedColor.g;
      colors[i * 3 + 2] = mixedColor.b;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Subtle 3D Coordinate Grid Plane
    const gridHelper = new THREE.GridHelper(8, 16, 0x0284c7, 0x1e293b);
    gridHelper.position.y = -2.2;
    gridHelper.rotation.x = 0.2;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.15;
    scene.add(gridHelper);

    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      // Smooth slow rotation of particle field
      particles.rotation.y = elapsedTime * 0.05;
      particles.rotation.x = Math.sin(elapsedTime * 0.03) * 0.08;

      // Dynamic light movement
      pointLight.position.x = Math.sin(elapsedTime * 0.8) * 2.2;
      pointLight.position.y = Math.cos(elapsedTime * 0.6) * 1.5;

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      if (newWidth && newHeight) {
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      gridHelper.geometry.dispose();
      if (Array.isArray(gridHelper.material)) {
        gridHelper.material.forEach((m) => m.dispose());
      } else {
        gridHelper.material.dispose();
      }
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [prefersReducedMotion]);

  // Dampened Cursor Parallax Tracking
  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (prefersReducedMotion || isMobile || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      // Natural tilt range: rotateX between 2 and 14 deg, rotateY between -20 and -4 deg
      const targetRotateX = 8 - y * 14;
      const targetRotateY = -12 + x * 18;

      setRotate({ x: targetRotateX, y: targetRotateY });
    },
    [prefersReducedMotion, isMobile]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (prefersReducedMotion || isMobile || !containerRef.current || !e.touches[0]) return;
      const rect = containerRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      const x = (touch.clientX - rect.left) / rect.width - 0.5;
      const y = (touch.clientY - rect.top) / rect.height - 0.5;

      setRotate({
        x: 8 - y * 10,
        y: -12 + x * 12,
      });
    },
    [prefersReducedMotion, isMobile]
  );

  const handleMouseEnter = () => setIsInteracting(true);
  const handleMouseLeave = () => {
    setIsInteracting(false);
    if (!prefersReducedMotion && !isMobile) {
      setRotate({ x: 8, y: -12 });
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative w-full max-w-[620px] mx-auto py-2 sm:py-4 select-none"
      style={{ perspective: isMobile ? "none" : "1200px" }}
      aria-label="Interactive 3D VORENT Product Demonstration"
    >
      {/* Three.js WebGL Particle Filament Backdrop Canvas */}
      <div
        ref={canvasContainerRef}
        className="absolute inset-0 -z-10 pointer-events-none opacity-80 overflow-hidden"
        aria-hidden="true"
      />

      {/* Atmospheric Ambient Lighting Glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-accent/15 rounded-full blur-[100px] pointer-events-none -z-10"
        aria-hidden="true"
      />

      {/* 3D Transform Stage Container */}
      <div
        className={`relative will-change-transform ${
          isInteracting ? "transition-transform duration-75 ease-out" : "transition-transform duration-500 ease-out"
        }`}
        style={{
          transform: isMobile
            ? "none"
            : prefersReducedMotion
            ? "rotateX(6deg) rotateY(-8deg)"
            : `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
          transformStyle: isMobile ? "flat" : "preserve-3d",
        }}
      >
        {/* =========================================================================
            1. CENTRAL FLOATING APPLICATION INTERFACE (Dimensional Console Workstation)
            ========================================================================= */}
        <div
          className="relative rounded-2xl bg-surface/90 dark:bg-canvas/95 border border-white/10 dark:border-accent/25 shadow-2xl backdrop-blur-xl overflow-hidden transition-all duration-300"
          style={{
            transform: "translateZ(0px)",
            boxShadow: isInteracting
              ? "0 25px 60px -15px rgba(2, 132, 199, 0.35), 0 0 35px rgba(14, 165, 233, 0.2)"
              : "0 20px 50px -12px rgba(0, 0, 0, 0.6), 0 0 25px rgba(14, 165, 233, 0.12)",
          }}
        >
          {/* Console Header Bar */}
          <div className="h-10 px-4 bg-chrome/90 border-b border-border/80 flex items-center justify-between">
            {/* Left: Window traffic controls + VORENT Identity */}
            <div className="flex items-center space-x-2.5">
              <div className="flex items-center space-x-1.5" aria-hidden="true">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <div className="h-3 w-[1px] bg-border mx-1" />
              <div className="flex items-center space-x-1.5">
                <VorentBrandMark className="w-4 h-4 text-accent" />
                <span className="font-mono text-[11px] font-bold tracking-wider text-ink">
                  VORENT<span className="text-accent text-[9px] ml-1">STUDIO</span>
                </span>
              </div>
            </div>

            {/* Center: Real Policy AST Identifier */}
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-surface-inset border border-border/70 text-[10px] font-mono text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-ink">pol_v1_books_hardware</span>
              <span className="text-accent font-semibold">v2-RFC8785</span>
            </div>

            {/* Right: Security & Sandbox Pills */}
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-allow/15 text-allow border border-allow/30">
                <ShieldCheck className="w-3 h-3 text-allow" />
                <span className="hidden xs:inline">D-014 ARMED</span>
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-sandbox-bg text-sandbox-text border border-sandbox-border">
                SANDBOX
              </span>
            </div>
          </div>

          {/* Console Sub-Header Telemetry Ribbon */}
          <div className="px-4 py-2 bg-surface-inset/60 border-b border-border/50 flex flex-wrap items-center justify-between text-[10px] font-mono gap-2">
            <div className="flex items-center space-x-3 text-muted">
              <span className="flex items-center space-x-1">
                <Activity className="w-3 h-3 text-accent" />
                <span>Verification State:</span>
                <strong className="text-allow">BOUNDED_OK</strong>
              </span>
              <span className="hidden sm:inline text-border">|</span>
              <span className="hidden sm:inline">Nonces Reserved: <strong className="text-ink">1-Time Only</strong></span>
            </div>
            <div className="flex items-center space-x-2 text-ink">
              <span className="text-muted">Replay Defenses:</span>
              <span className="px-1.5 py-0.5 rounded bg-surface border border-border text-[9px] text-accent">
                HTTP 409 LOCKED
              </span>
            </div>
          </div>

          {/* Console Body: 3-Pillar Operational Workflow Grid */}
          <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-3.5 bg-gradient-to-b from-surface/40 to-canvas/80">
            {/* Workflow Pillar 1: Mandate AST */}
            <div
              className={`p-3 rounded-xl border transition-all duration-200 ${
                activeFeature === "ast"
                  ? "bg-accent/10 border-accent shadow-sm shadow-accent/20"
                  : "bg-surface-inset/80 border-border/70 hover:border-border-strong"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-1.5">
                  <FileCode2 className="w-3.5 h-3.5 text-accent" />
                  <span className="font-mono text-[10px] font-bold text-ink">Intent AST</span>
                </div>
                <span className="text-[9px] font-mono text-muted">IMMUTABLE</span>
              </div>
              <div className="space-y-1.5 font-mono text-[10px]">
                <div className="p-1.5 rounded bg-surface border border-border/60 flex items-center justify-between">
                  <span className="text-muted">books_dev</span>
                  <span className="text-allow font-bold">ALLOW ≤ $150</span>
                </div>
                <div className="p-1.5 rounded bg-surface border border-border/60 flex items-center justify-between">
                  <span className="text-muted">office_monitors</span>
                  <span className="text-warning font-bold">REVIEW ≤ $600</span>
                </div>
                <div className="p-1.5 rounded bg-surface border border-border/60 flex items-center justify-between">
                  <span className="text-muted">gift_cards</span>
                  <span className="text-danger font-bold">DENY</span>
                </div>
              </div>
              <div className="mt-2 text-[9px] font-mono text-muted truncate">
                Hash: <span className="text-accent">sha256:7f4c9a...</span>
              </div>
            </div>

            {/* Workflow Pillar 2: Loophole Model Checker */}
            <div
              className={`p-3 rounded-xl border transition-all duration-200 ${
                activeFeature === "checker"
                  ? "bg-amber-500/10 border-amber-500 shadow-sm shadow-amber-500/20"
                  : "bg-surface-inset/80 border-border/70 hover:border-border-strong"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-warning" />
                  <span className="font-mono text-[10px] font-bold text-ink">Loophole Search</span>
                </div>
                <span className="px-1 rounded bg-deny/20 text-danger text-[9px] font-mono font-bold">
                  D-014 HIT
                </span>
              </div>
              <div className="p-2 rounded bg-surface border border-border/60 space-y-1.5">
                <div className="text-[9px] font-mono text-muted">Candidate Space: 128 tests</div>
                <div className="p-1.5 rounded bg-deny/10 border border-deny/30 text-[9px] font-mono text-ink">
                  <span className="text-danger font-bold">INV-01 VIOLATION:</span>
                  <div className="text-muted truncate">3x Monitor = $660.00 &gt; $600</div>
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono pt-0.5">
                  <span className="text-muted">Verdict:</span>
                  <span className="text-danger font-bold">BLOCKED (0 Drift)</span>
                </div>
              </div>
            </div>

            {/* Workflow Pillar 3: Cryptographic Nonce & PayPal Gate */}
            <div
              className={`p-3 rounded-xl border transition-all duration-200 ${
                activeFeature === "nonce"
                  ? "bg-emerald-500/10 border-emerald-500 shadow-sm shadow-emerald-500/20"
                  : "bg-surface-inset/80 border-border/70 hover:border-border-strong"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-1.5">
                  <Lock className="w-3.5 h-3.5 text-allow" />
                  <span className="font-mono text-[10px] font-bold text-ink">Nonce Gate</span>
                </div>
                <span className="text-[9px] font-mono text-allow">ACTIVE</span>
              </div>
              <div className="space-y-1.5 font-mono text-[10px]">
                <div className="p-1.5 rounded bg-surface border border-border/60">
                  <div className="text-[9px] text-muted">Single-Use Nonce UUID:</div>
                  <div className="text-ink truncate font-mono text-[9px]">nonce_v4_8f1a29c0</div>
                </div>
                <div className="p-1.5 rounded bg-surface border border-border/60">
                  <div className="text-[9px] text-muted">Row-Level Lock:</div>
                  <div className="text-accent text-[9px]">SELECT ... FOR UPDATE</div>
                </div>
                <div className="flex items-center space-x-1 text-allow text-[9px] font-bold pt-0.5">
                  <CheckCircle2 className="w-3 h-3 text-allow" />
                  <span>0 PayPal Leaks on DENY</span>
                </div>
              </div>
            </div>
          </div>

          {/* Console Footer Live Terminal Feed */}
          <div className="px-4 py-2.5 bg-chrome border-t border-border flex items-center justify-between text-[10px] font-mono">
            <div className="flex items-center space-x-2 text-muted">
              <Terminal className="w-3.5 h-3.5 text-accent" />
              <span className="text-ink">VORENT Runtime Daemon:</span>
              <span className="text-allow">Listening on port 3001</span>
            </div>
            <div className="flex items-center space-x-2">
              {onExploreFeatures && (
                <button
                  type="button"
                  onClick={onExploreFeatures}
                  className="text-muted hover:text-accent font-medium text-[9px] transition-colors cursor-pointer"
                >
                  Explore Capabilities
                </button>
              )}
              <button
                type="button"
                onClick={() => onLaunchConsole && onLaunchConsole("overview")}
                className="text-accent hover:text-accent-active font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
              >
                <span>View Full Workstation</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Floating Authoritative Metallic V Seal Stamp (Anchor top-right) */}
        <div
          className="absolute -top-3 right-3 sm:right-8 flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-surface-raised/95 border border-accent/40 shadow-lg backdrop-blur-md z-20"
          style={{ transform: isMobile || prefersReducedMotion ? undefined : "translateZ(75px)" }}
          title="VORENT Cryptographic Seal"
        >
          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-accent animate-ping" />
          <span className="text-[9px] sm:text-[10px] font-mono font-bold text-ink tracking-wider">
            VORENT VERIFIED PROOF
          </span>
        </div>

        {/* =========================================================================
            2. RESPONSIVE NON-COLLIDING 3D CAPABILITY HIGHLIGHT CARDS (Grid Docked)
            ========================================================================= */}
        <div
          className="mt-3 sm:mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3"
          style={{ transform: isMobile || prefersReducedMotion ? undefined : "translateZ(35px)" }}
        >
          {/* Capability 1: Intent AST Compiler */}
          <div
            onMouseEnter={() => setActiveFeature("ast")}
            onMouseLeave={() => setActiveFeature(null)}
            className="p-3 rounded-xl bg-surface/90 dark:bg-canvas/95 border border-white/10 dark:border-accent/30 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:border-accent cursor-pointer group"
            style={{
              boxShadow:
                activeFeature === "ast"
                  ? "0 12px 28px -5px rgba(14, 165, 233, 0.35)"
                  : "0 6px 18px -4px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div className="flex items-center space-x-2.5 mb-1.5">
              <div className="w-6 h-6 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                <FileCode2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="font-sans font-bold text-xs text-ink group-hover:text-accent transition-colors truncate">
                  Intent AST Compiler
                </div>
                <div className="font-mono text-[9px] text-muted truncate">RFC 8785 Canonical JSON</div>
              </div>
            </div>
            <p className="text-[10px] text-muted leading-tight">
              Compiles natural-language purchasing rules into immutable TypeScript AST contracts.
            </p>
          </div>

          {/* Capability 2: Loophole Model Checker */}
          <div
            onMouseEnter={() => setActiveFeature("checker")}
            onMouseLeave={() => setActiveFeature(null)}
            className="p-3 rounded-xl bg-surface/90 dark:bg-canvas/95 border border-white/10 dark:border-amber-500/30 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:border-amber-400 cursor-pointer group"
            style={{
              boxShadow:
                activeFeature === "checker"
                  ? "0 12px 28px -5px rgba(245, 158, 11, 0.35)"
                  : "0 6px 18px -4px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div className="flex items-center space-x-2.5 mb-1.5">
              <div className="w-6 h-6 rounded-lg bg-warning/15 border border-warning/30 flex items-center justify-center text-warning shrink-0">
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="font-sans font-bold text-xs text-ink group-hover:text-warning transition-colors truncate">
                  Loophole Model Checker
                </div>
                <div className="font-mono text-[9px] text-muted truncate">D-014 Fail-Closed Gate</div>
              </div>
            </div>
            <p className="text-[10px] text-muted leading-tight">
              Finite bounded search catches exploit counterexamples before any funds can move.
            </p>
          </div>

          {/* Capability 3: Single-Use Nonce Replay Guard */}
          <div
            onMouseEnter={() => setActiveFeature("nonce")}
            onMouseLeave={() => setActiveFeature(null)}
            className="p-3 rounded-xl bg-surface/90 dark:bg-canvas/95 border border-white/10 dark:border-emerald-500/30 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:border-emerald-400 cursor-pointer group"
            style={{
              boxShadow:
                activeFeature === "nonce"
                  ? "0 12px 28px -5px rgba(16, 185, 129, 0.35)"
                  : "0 6px 18px -4px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div className="flex items-center space-x-2.5 mb-1.5">
              <div className="w-6 h-6 rounded-lg bg-allow/15 border border-allow/30 flex items-center justify-center text-allow shrink-0">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="font-sans font-bold text-xs text-ink group-hover:text-allow transition-colors truncate">
                  1-Time Nonce Guard
                </div>
                <div className="font-mono text-[9px] text-muted truncate">HTTP 409 Conflict Guard</div>
              </div>
            </div>
            <p className="text-[10px] text-muted leading-tight">
              Single-use cryptographic nonces prevent replay attacks and duplicate authorizations.
            </p>
          </div>

          {/* Capability 4: PayPal Sandbox Rail */}
          <div
            onMouseEnter={() => setActiveFeature("sandbox")}
            onMouseLeave={() => setActiveFeature(null)}
            className="p-3 rounded-xl bg-surface/90 dark:bg-canvas/95 border border-white/10 dark:border-accent/30 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:border-accent cursor-pointer group"
            style={{
              boxShadow:
                activeFeature === "sandbox"
                  ? "0 12px 28px -5px rgba(14, 165, 233, 0.35)"
                  : "0 6px 18px -4px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div className="flex items-center space-x-2.5 mb-1.5">
              <div className="w-6 h-6 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="font-sans font-bold text-xs text-ink group-hover:text-accent transition-colors truncate">
                  PayPal Sandbox Rail
                </div>
                <div className="font-mono text-[9px] text-muted truncate">Orders v2 Tamper-Proof</div>
              </div>
            </div>
            <p className="text-[10px] text-muted leading-tight">
              Cryptographic evidence packet export with fail-closed audit isolation.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Exploration Hint */}
      <div className="mt-6 flex items-center justify-center space-x-2 text-[11px] font-mono text-muted text-center">
        <Layers className="w-3.5 h-3.5 text-accent" />
        <span>Hover or tilt to inspect connected 3D verification layers</span>
      </div>
    </div>
  );
}
