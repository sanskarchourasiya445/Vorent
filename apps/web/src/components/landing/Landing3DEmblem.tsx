import { useState, useRef, useCallback, useEffect, type MouseEvent, type TouchEvent } from "react";
import * as THREE from "three";

export function Landing3DEmblem() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [webGlSupported, setWebGlSupported] = useState(true);

  // Check WCAG prefers-reduced-motion
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);

    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  // Three.js WebGL Scene Initialization
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
      setWebGlSupported(false);
      return;
    }

    const width = container.clientWidth || 240;
    const height = container.clientHeight || 240;

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 7.5);

    // Group for 3D Emblem Model
    const emblemGroup = new THREE.Group();
    scene.add(emblemGroup);

    // Create 3D VORENT V Shape geometry from SVG coordinate specifications
    // Normalized scale: centered around (0,0)
    // Left Wing Blade
    const leftShape = new THREE.Shape();
    leftShape.moveTo(-1.74, 1.7);
    leftShape.lineTo(-1.15, 1.0);
    leftShape.lineTo(-0.8, -0.65);
    leftShape.lineTo(0.0, -1.7);
    leftShape.lineTo(-0.35, -0.5);
    leftShape.lineTo(-0.9, 1.1);
    leftShape.closePath();

    // Right Wing Blade
    const rightShape = new THREE.Shape();
    rightShape.moveTo(1.74, 1.7);
    rightShape.lineTo(1.15, 1.0);
    rightShape.lineTo(0.8, -0.65);
    rightShape.lineTo(0.0, -1.7);
    rightShape.lineTo(0.35, -0.5);
    rightShape.lineTo(0.9, 1.1);
    rightShape.closePath();

    // Center Core Inset
    const coreShape = new THREE.Shape();
    coreShape.moveTo(-0.9, 1.1);
    coreShape.lineTo(0.0, -0.4);
    coreShape.lineTo(0.9, 1.1);
    coreShape.lineTo(0.6, 1.1);
    coreShape.lineTo(0.0, 0.1);
    coreShape.lineTo(-0.6, 1.1);
    coreShape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.22,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.05,
      bevelThickness: 0.06,
    };

    const leftGeo = new THREE.ExtrudeGeometry(leftShape, extrudeSettings);
    const rightGeo = new THREE.ExtrudeGeometry(rightShape, extrudeSettings);
    const coreGeo = new THREE.ExtrudeGeometry(coreShape, {
      ...extrudeSettings,
      depth: 0.12,
      bevelThickness: 0.03,
    });

    // Metallic PBR Materials
    const metallicSilverMaterial = new THREE.MeshStandardMaterial({
      color: 0xdde6ed,
      metalness: 0.88,
      roughness: 0.18,
    });

    const electricBlueCoreMaterial = new THREE.MeshStandardMaterial({
      color: 0x0099ff,
      emissive: 0x0044aa,
      emissiveIntensity: 0.6,
      metalness: 0.5,
      roughness: 0.25,
    });

    const leftMesh = new THREE.Mesh(leftGeo, metallicSilverMaterial);
    const rightMesh = new THREE.Mesh(rightGeo, metallicSilverMaterial);
    const coreMesh = new THREE.Mesh(coreGeo, electricBlueCoreMaterial);
    coreMesh.position.z = 0.04;

    emblemGroup.add(leftMesh);
    emblemGroup.add(rightMesh);
    emblemGroup.add(coreMesh);

    // 3D Ambient Cryptographic Particles
    const PARTICLE_COUNT = 64;
    const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT * 3; i += 3) {
      particlePositions[i] = (Math.random() - 0.5) * 5.5;
      particlePositions[i + 1] = (Math.random() - 0.5) * 5.5;
      particlePositions[i + 2] = (Math.random() - 0.5) * 3.5;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.055,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Lighting Setup
    const ambientLight = new THREE.AmbientLight(0x0f172a, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(4, 5, 6);
    scene.add(dirLight);

    const electricPointLight = new THREE.PointLight(0x00b4ff, 3.2, 10);
    electricPointLight.position.set(0, 0, 3);
    scene.add(electricPointLight);

    const rimLight = new THREE.DirectionalLight(0x0284c7, 1.2);
    rimLight.position.set(-4, -3, 2);
    scene.add(rimLight);

    let animationFrameId: number;
    let clock = new THREE.Clock();

    // Target rotation interpolated smoothly
    let targetRotX = 0;
    let targetRotY = 0;

    const animate = () => {
      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      // Idle float
      const idleFloatY = Math.sin(elapsedTime * 1.2) * 0.08;
      const idleFloatX = Math.cos(elapsedTime * 0.9) * 0.05;

      // Smooth damped rotation interpolation
      emblemGroup.rotation.x += (targetRotX + idleFloatX - emblemGroup.rotation.x) * (delta * 6);
      emblemGroup.rotation.y += (targetRotY + idleFloatY - emblemGroup.rotation.y) * (delta * 6);

      // Subtle particle drift
      particles.rotation.y = elapsedTime * 0.04;
      particles.rotation.x = elapsedTime * 0.02;

      // Point light tracks emblem rotation
      electricPointLight.position.x = Math.sin(emblemGroup.rotation.y) * 2.5;
      electricPointLight.position.y = -Math.sin(emblemGroup.rotation.x) * 2.5;

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    const handleContainerMouseMove = (e: MouseEvent<HTMLDivElement>) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      targetRotY = x * 0.35; // ~20 degrees
      targetRotX = -y * 0.35;
    };

    const handleContainerMouseLeave = () => {
      targetRotX = 0;
      targetRotY = 0;
    };

    const targetEl = containerRef.current;
    if (targetEl) {
      targetEl.addEventListener("mousemove", handleContainerMouseMove as any);
      targetEl.addEventListener("mouseleave", handleContainerMouseLeave);
    }

    return () => {
      if (targetEl) {
        targetEl.removeEventListener("mousemove", handleContainerMouseMove as any);
        targetEl.removeEventListener("mouseleave", handleContainerMouseLeave);
      }
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      leftGeo.dispose();
      rightGeo.dispose();
      coreGeo.dispose();
      metallicSilverMaterial.dispose();
      electricBlueCoreMaterial.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [prefersReducedMotion]);

  // CSS perspective tilt handler (for housing card)
  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (prefersReducedMotion || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -8;
      const rotateY = ((x - centerX) / centerX) * 8;

      setRotate({ x: rotateX, y: rotateY });
    },
    [prefersReducedMotion]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      if (prefersReducedMotion || !containerRef.current || !e.touches[0]) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -6;
      const rotateY = ((x - centerX) / centerX) * 6;

      setRotate({ x: rotateX, y: rotateY });
    },
    [prefersReducedMotion]
  );

  const handleMouseLeave = useCallback(() => {
    setRotate({ x: 0, y: 0 });
    setIsHovered(false);
  }, []);

  const sheenX = 50 + rotate.y * 3;
  const sheenY = 50 + rotate.x * -3;

  return (
    <div
      ref={containerRef}
      onMouseMove={(e) => {
        setIsHovered(true);
        handleMouseMove(e);
      }}
      onTouchMove={(e) => {
        setIsHovered(true);
        handleTouchMove(e);
      }}
      onMouseLeave={handleMouseLeave}
      onTouchEnd={handleMouseLeave}
      className="relative flex items-center justify-center p-4 sm:p-8 cursor-pointer select-none group"
      style={{ perspective: 1200 }}
      role="img"
      aria-label="VORENT 3D Metallic V Emblem with Electric-Blue Backlight"
    >
      {/* Precision Instrument Corner Crosshairs */}
      <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-accent/40 pointer-events-none" aria-hidden="true" />
      <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-accent/40 pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-accent/40 pointer-events-none" aria-hidden="true" />
      <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-accent/40 pointer-events-none" aria-hidden="true" />

      {/* Layer 0: Restrained Electric-Blue Backlight Illumination Halo */}
      <div
        className={`absolute inset-0 rounded-3xl bg-radial from-sky-500/25 via-sky-600/10 to-transparent blur-3xl transition-all duration-700 pointer-events-none ${
          isHovered ? "opacity-100 scale-110" : "opacity-45 scale-95"
        }`}
        aria-hidden="true"
      />

      {/* Layer 1: Holographic Target Coordinate Ring */}
      <div
        className={`absolute inset-3 sm:inset-4 rounded-2xl border border-sky-400/20 dark:border-sky-500/25 pointer-events-none transition-transform duration-300 ease-out ${
          isHovered ? "scale-105" : "scale-100"
        }`}
        aria-hidden="true"
      />

      {/* Layer 2: Dimensional Glassmorphism Card Housing */}
      <div
        className="relative w-56 h-56 sm:w-68 sm:h-68 rounded-2xl p-4 sm:p-6 bg-surface/85 border border-border shadow-2xl backdrop-blur-md flex flex-col items-center justify-center transition-transform duration-200 ease-out"
        style={{
          transform: prefersReducedMotion
            ? "none"
            : `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg) ${
                isHovered ? "scale3d(1.02, 1.02, 1.02)" : "scale3d(1, 1, 1)"
              }`,
          transformStyle: "preserve-3d",
        }}
      >
        {/* Dynamic Specular Sheen Tracking Cursor */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-hidden"
          style={{
            background: `radial-gradient(circle at ${sheenX}% ${sheenY}%, rgba(255, 255, 255, 0.16) 0%, transparent 60%)`,
          }}
          aria-hidden="true"
        />

        {/* Layer 3: Genuine Three.js 3D WebGL Canvas Stage */}
        <div
          ref={canvasContainerRef}
          className="relative w-36 h-36 sm:w-44 sm:h-44 flex items-center justify-center drop-shadow-[0_12px_24px_rgba(0,180,255,0.3)]"
          style={{ transform: prefersReducedMotion ? "none" : "translateZ(36px)" }}
        >
          {/* Static Fallback Emblem for SEO, Reduced Motion, or Non-WebGL */}
          <img
            src="/brand/vorent-emblem.png"
            alt="VORENT Metallic V Emblem"
            width={160}
            height={160}
            className={`w-full h-full object-contain filter contrast-105 ${
              !prefersReducedMotion && webGlSupported ? "hidden" : "block"
            }`}
            loading="eager"
            decoding="async"
          />
        </div>

        {/* Layer 4: Embossed Brand Identifier & Cryptographic Status */}
        <div
          className="mt-2 text-center space-y-1"
          style={{ transform: prefersReducedMotion ? "none" : "translateZ(20px)" }}
        >
          <span className="font-sans font-extrabold tracking-[0.24em] text-xs text-ink uppercase block">
            VORENT
          </span>
          <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-surface-inset border border-border">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="font-mono text-[9px] tracking-wider text-muted uppercase">
              FAIL-CLOSED GATE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
