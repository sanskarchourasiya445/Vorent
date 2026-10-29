import { useState, type ElementType } from "react";
import { ArrowRight, LayoutGrid, ShieldCheck, CreditCard, FileCheck } from "lucide-react";
import { useTheme } from "../../providers/ThemeProvider";

export interface LandingShowcaseProps {
  onLaunchConsole: (workstation?: string) => void;
}

interface ShowcaseTab {
  id: string;
  label: string;
  workstation: string;
  icon: ElementType;
  title: string;
  description: string;
  darkImage: string;
  lightImage: string;
  highlights: string[];
}

const SHOWCASE_TABS: ShowcaseTab[] = [
  {
    id: "dashboard",
    label: "Command Center",
    workstation: "overview",
    icon: LayoutGrid,
    title: "System Dashboard & Real-Time Risk Posture",
    description:
      "Continuous monitoring of active spend reservations, PayPal Sandbox connectivity, and fail-closed Decision D-014 governance blocking defective policies.",
    darkImage: "/screenshots/01_desktop_1440x900_dark.png",
    lightImage: "/screenshots/08_desktop_1440x900_light.png",
    highlights: [
      "Decision D-014 Alert: 25 unresolved high/critical findings block approval creation",
      "Active spend reservation tracking against $1,500 authorized budget",
      "PayPal Sandbox Orders v2 connectivity probe & health telemetry",
    ],
  },
  {
    id: "verification",
    label: "Verification Studio",
    workstation: "verification",
    icon: ShieldCheck,
    title: "Finite-Domain Permutation Loophole Search",
    description:
      "Bounded combinatorial model checking across 4 dimensions: price ceiling, item quantity, category drift, and digital gift cards/accessories.",
    darkImage: "/screenshots/04_dark_verification_studio_desktop_1440x900.png",
    lightImage: "/screenshots/11_light_verification_studio_desktop_1440x900.png",
    highlights: [
      "Explores 250 to 2,000 cart combinations drawn from declared server catalog",
      "Discovers seeded loophole: cart total unbounded while item price capped",
      "Honest bounded search disclaimer: no false claims of unconstrained inductive safety",
    ],
  },
  {
    id: "checkout",
    label: "Checkout Gate",
    workstation: "checkout",
    icon: CreditCard,
    title: "Cryptographic Nonce Replay & Checkout Enforcement",
    description:
      "Single-use 256-bit cryptographic nonces consumed atomically in PostgreSQL. Only an ALLOW decision can initiate PayPal Sandbox Orders v2 creation.",
    darkImage: "/screenshots/07_dark_checkout_gate_desktop_1440x900.png",
    lightImage: "/screenshots/12_light_checkout_gate_desktop_1440x900.png",
    highlights: [
      "Nonce replay defense: duplicate checkout proposals return HTTP 409 Conflict",
      "4-Stage Pipeline: Policy Check → Reservation → Order Creation → Capture",
      "Reconciliation hold triggers for ambiguous network timeouts",
    ],
  },
  {
    id: "evaluation",
    label: "Evaluation Report",
    workstation: "evaluation",
    icon: FileCheck,
    title: "Cryptographic Invariant Proofs & RFC 8785 Evidence Hub",
    description:
      "Empirical verification of 6 formal security invariants with tamper-evident JSON Canonicalization Scheme (RFC 8785) audit dossiers.",
    darkImage: "/screenshots/09_dark_evaluation_report_desktop_1440x900.png",
    lightImage: "/screenshots/13_light_evaluation_report_desktop_1440x900.png",
    highlights: [
      "6/6 Formal Security Invariants verified passing with zero violations",
      "Append-only audit trail logging all state mutations and actor signatures",
      "Canonical JSON evidence packet export with SHA-256 digest validation",
    ],
  },
];

export function LandingShowcase({ onLaunchConsole }: LandingShowcaseProps) {
  const [activeTabId, setActiveTabId] = useState<string>("dashboard");
  const { resolvedTheme } = useTheme();

  const activeTab = SHOWCASE_TABS.find((t) => t.id === activeTabId) || SHOWCASE_TABS[0];
  const currentImage = resolvedTheme === "light" ? activeTab.lightImage : activeTab.darkImage;

  return (
    <section id="showcase" className="scroll-mt-16 py-16 sm:py-24 bg-canvas-subtle/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-accent font-semibold">
            Product Showcase
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-ink tracking-tight">
            An Authoritative Security Console, Not a Chatbot
          </h2>
          <p className="text-sm sm:text-base text-muted font-sans">
            Nine purpose-built workstations engineered for deterministic financial governance, formal
            verification, and PayPal Sandbox settlement observation.
          </p>
        </div>

        {/* Tab Navigation Strip */}
        <div className="w-full flex items-center justify-center overflow-hidden">
          <div className="inline-flex p-1 rounded-lg bg-surface-inset border border-border overflow-x-auto max-w-full no-scrollbar">
            {SHOWCASE_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={`inline-flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-md text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? "bg-surface-raised text-ink shadow-xs border border-border"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-accent" : "text-muted"}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dimensional Product Frame with Electric-Blue Halo */}
        <div className="relative group mx-auto max-w-6xl">
          {/* Subtle Ambient Electric-Blue Glow */}
          <div
            className="absolute -inset-1.5 rounded-2xl bg-sky-500/10 dark:bg-sky-500/20 blur-2xl opacity-60 group-hover:opacity-90 transition-opacity duration-500 pointer-events-none"
            aria-hidden="true"
          />

          {/* Dimensional Frame Container */}
          <div
            className="relative rounded-2xl border border-border/80 bg-surface shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_60px_rgba(0,180,255,0.12)] overflow-hidden transition-all duration-300"
            style={{
              transform: "perspective(1200px) rotateX(1deg)",
              transformOrigin: "center top",
            }}
          >
            {/* Top Window Chrome Bar */}
            <div className="px-4 py-2.5 bg-chrome border-b border-border flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
              </div>

              <div className="flex-1 max-w-md mx-4 hidden sm:block">
                <div className="bg-surface-inset border border-border rounded px-3 py-1 text-center font-mono text-[11px] text-muted truncate">
                  https://console.vorent.internal/?ws={activeTab.workstation}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="font-mono text-[10px] text-muted uppercase">
                  {resolvedTheme === "light" ? "Light Mode (Slate & Electric Blue)" : "Dark Mode (Midnight Navy)"}
                </span>
              </div>
            </div>

            {/* Screenshot Display Area */}
            <div className="relative aspect-16/10 w-full bg-canvas overflow-hidden">
              <img
                key={currentImage}
                src={currentImage}
                alt={activeTab.title}
                className="w-full h-full object-contain object-top transition-opacity duration-300"
                loading="lazy"
              />
            </div>

            {/* Information Strip & Workstation CTA */}
            <div className="p-5 sm:p-6 bg-surface border-t border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <h3 className="text-base sm:text-lg font-bold text-ink">
                  {activeTab.title}
                </h3>
                <p className="text-xs text-muted leading-relaxed font-sans">
                  {activeTab.description}
                </p>
                <ul className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {activeTab.highlights.map((h, i) => (
                    <li key={i} className="flex items-center space-x-2 text-[11px] text-ink font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                      <span className="truncate">{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => onLaunchConsole(activeTab.workstation)}
                className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-md font-semibold text-xs bg-primary hover:bg-primary-hover active:bg-primary-active text-white transition-colors cursor-pointer shrink-0 shadow-2xs self-start md:self-center"
              >
                <span>Inspect {activeTab.label}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
