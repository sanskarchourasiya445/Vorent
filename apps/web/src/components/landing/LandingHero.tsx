import { useCallback } from "react";
import {
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Terminal,
  FileCheck,
  Compass,
} from "lucide-react";
import { LandingAmbientParticles } from "./LandingAmbientParticles";
import { Landing3DProductHero } from "./Landing3DProductHero";
import { useAuth } from "../../providers/AuthContext";

export interface LandingHeroProps {
  onLaunchConsole: (workstation?: string) => void;
  onOpenRegister?: () => void;
  onExploreFeatures?: () => void;
}

export function LandingHero({
  onLaunchConsole,
  onOpenRegister,
  onExploreFeatures,
}: LandingHeroProps) {
  const { openAuthModal, isAuthenticated } = useAuth();

  const handleSignUpClick = useCallback(() => {
    if (onOpenRegister) {
      onOpenRegister();
    } else {
      openAuthModal("register");
    }
  }, [onOpenRegister, openAuthModal]);

  const handleExploreFeaturesClick = useCallback(() => {
    if (onExploreFeatures) {
      onExploreFeatures();
    } else {
      const el = document.getElementById("capabilities") || document.getElementById("how-it-works");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      } else {
        onLaunchConsole("verification");
      }
    }
  }, [onExploreFeatures, onLaunchConsole]);

  return (
    <section className="relative overflow-hidden pt-6 pb-12 sm:pt-8 sm:pb-16 lg:pt-10 lg:pb-20 bg-radial from-surface-soft/40 via-canvas to-canvas">
      {/* Background Ambient Particles Simulation */}
      <LandingAmbientParticles />

      {/* Subtle Spatial Coordinate Grid Lines */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
          backgroundSize: "44px 44px",
        }}
        aria-hidden="true"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-8 xl:gap-12 items-center">
          {/* =========================================================================
              Left Column: Value Proposition, Headlines & Prominent CTAs
              ========================================================================= */}
          <div className="lg:col-span-5 xl:col-span-5 space-y-5 sm:space-y-6 text-left">
            {/* Eyebrow Pill */}
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-surface-inset border border-border text-accent text-[11px] sm:text-xs font-mono font-medium max-w-full">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
              <span className="truncate">CRYPTOGRAPHIC FINANCIAL GOVERNANCE</span>
            </div>

            {/* Main Compelling Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-[1.12]">
              AI agents shouldn't authorize their own payments.
            </h1>

            {/* Clear Explanation of Purpose */}
            <p className="text-sm sm:text-base text-muted leading-relaxed font-sans">
              When autonomous purchasing assistants are granted direct payment credentials,
              semantic ambiguity and prompt injections allow unwanted purchases or runaway spending.
              <strong className="text-ink font-semibold"> VORENT</strong> decouples agent proposals
              from financial authority—compiling intent into formal AST rules, exploring candidate
              spaces for loophole counterexamples, and enforcing fail-closed approvals with single-use
              cryptographic nonces on the PayPal Sandbox rail.
            </p>

            {/* Prominent Action CTAs: Sign Up (Primary) & Explore Features (Secondary) */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {/* Prominent Primary CTA: Sign Up */}
              <button
                type="button"
                data-testid="hero-signup-btn"
                onClick={handleSignUpClick}
                className="inline-flex items-center space-x-2 px-5 py-3 rounded-md font-bold text-xs sm:text-sm bg-primary hover:bg-primary-hover active:bg-primary-active text-white transition-all shadow-md hover:shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <span>Sign Up</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Prominent Secondary Action: Explore Features */}
              <button
                type="button"
                data-testid="hero-explore-features-btn"
                onClick={handleExploreFeaturesClick}
                className="inline-flex items-center space-x-2 px-4 py-3 rounded-md font-semibold text-xs sm:text-sm bg-surface-raised hover:bg-surface border border-border text-ink hover:text-accent transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent shadow-2xs"
              >
                <Compass className="w-4 h-4 text-accent" />
                <span>Explore Features</span>
              </button>

              {/* Auxiliary Console Quick Launch */}
              <button
                type="button"
                onClick={() => onLaunchConsole("overview")}
                className="inline-flex items-center space-x-1.5 px-3 py-3 rounded-md text-xs sm:text-sm font-medium text-muted hover:text-ink transition-colors cursor-pointer"
              >
                <span>Launch Sandbox Console</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Verification Tour & Persona Quick Links */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted pt-0.5">
              <button
                type="button"
                onClick={() => onLaunchConsole("verification")}
                className="inline-flex items-center space-x-1.5 text-muted hover:text-accent transition-colors cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 text-accent" />
                <span>Run Verification Tour</span>
              </button>

              {!isAuthenticated && (
                <>
                  <span className="text-border" aria-hidden="true">•</span>
                  <button
                    type="button"
                    onClick={() => openAuthModal("login")}
                    className="inline-flex items-center space-x-1 text-muted hover:text-ink font-mono transition-colors cursor-pointer"
                  >
                    <Lock className="w-3 h-3" />
                    <span>Persona Sign In</span>
                  </button>
                </>
              )}
            </div>

            {/* Proven Trust Verification Strip */}
            <div className="pt-5 border-t border-border/60">
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted mb-3">
                Empirically Verified Guarantees
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-allow shrink-0" />
                  <span className="font-mono text-ink text-[11px]">790 Tests Passing</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
                  <span className="font-mono text-ink text-[11px]">D-014 Fail-Closed</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <FileCheck className="w-4 h-4 text-allow shrink-0" />
                  <span className="font-mono text-ink text-[11px]">RFC 8785 Hashing</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <Lock className="w-4 h-4 text-accent shrink-0" />
                  <span className="font-mono text-ink text-[11px]">PayPal Sandbox v2</span>
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================================
              Right Column: Cinematic Interactive 3D Product Experience
              ========================================================================= */}
          <div className="lg:col-span-7 xl:col-span-7 flex flex-col items-center justify-center">
            <Landing3DProductHero
              onLaunchConsole={onLaunchConsole}
              onExploreFeatures={handleExploreFeaturesClick}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
