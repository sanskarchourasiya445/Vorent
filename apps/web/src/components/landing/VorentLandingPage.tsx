import { useEffect } from "react";
import { LandingNavbar } from "./LandingNavbar";
import { LandingHero } from "./LandingHero";
import { LandingShowcase } from "./LandingShowcase";
import { LandingProblemSolution } from "./LandingProblemSolution";
import { LandingHowItWorks } from "./LandingHowItWorks";
import { LandingCapabilities } from "./LandingCapabilities";
import { LandingSecurityInvariants } from "./LandingSecurityInvariants";
import { LandingFaq } from "./LandingFaq";
import { LandingFooter } from "./LandingFooter";

export interface VorentLandingPageProps {
  onLaunchConsole?: (workstation?: string) => void;
  onEnterApp?: (workstation?: string) => void;
  onOpenLogin?: () => void;
  onOpenRegister?: () => void;
}

export function VorentLandingPage({
  onLaunchConsole,
  onEnterApp,
  onOpenLogin,
  onOpenRegister,
}: VorentLandingPageProps) {
  const handleLaunch = onLaunchConsole || onEnterApp || (() => {});

  // Ensure smooth window scroll to top when mounting landing page
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  return (
    <div className="min-h-screen w-full overflow-x-clip bg-canvas text-ink flex flex-col font-sans antialiased selection:bg-accent selection:text-white">
      {/* 1. Top Navigation Bar - Sticky across full page scroll */}
      <LandingNavbar
        onLaunchConsole={handleLaunch}
        onOpenLogin={onOpenLogin}
        onOpenRegister={onOpenRegister}
      />

      {/* Main Page Flow */}
      <main className="flex-1 w-full overflow-x-clip">
        {/* 2. Hero Section with 3D Product Experience & Prominent CTAs */}
        <LandingHero
          onLaunchConsole={handleLaunch}
          onOpenRegister={onOpenRegister}
        />

        {/* 3. Problem vs Solution: The Self-Authorization Flaw */}
        <LandingProblemSolution />

        {/* 4. How It Works: The 5-Stage Verification Loop */}
        <LandingHowItWorks />

        {/* 5. Core Capabilities: Architectural Deep Dives */}
        <LandingCapabilities />

        {/* 6. Product Showcase: Real Screenshots with Theme Switching */}
        <LandingShowcase onLaunchConsole={handleLaunch} />

        {/* 7. Security Invariants & Trust Matrix */}
        <LandingSecurityInvariants />

        {/* 8. Frequently Asked Questions */}
        <LandingFaq />
      </main>

      {/* 9. Final Call to Action & Canonical Footer */}
      <LandingFooter onLaunchConsole={handleLaunch} />
    </div>
  );
}
