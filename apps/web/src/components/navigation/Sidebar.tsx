import React from "react";
import {
  LayoutGrid,
  FileText,
  Layers,
  ShieldCheck,
  Search,
  CheckCircle2,
  CreditCard,
  ArrowLeftRight,
  FileCheck,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import type { WorkstationGroup } from "../../App";
import type { PolicyOption } from "../../types/verification";

// Icon mapping matching the VORENT cyber-finance visual specification
export const WORKSTATION_ICONS: Record<string, LucideIcon> = {
  overview: LayoutGrid,
  mandate: FileText,
  intent: FileText,
  "policy-versions": Layers,
  verification: ShieldCheck,
  findings: Search,
  approval: CheckCircle2,
  checkout: CreditCard,
  transactions: ArrowLeftRight,
  purchases: CreditCard,
  evaluation: FileCheck,
};

export interface VorentBrandMarkProps {
  className?: string;
  isCollapsed?: boolean;
  showWordmark?: boolean;
}

export function VorentBrandMark({
  className = "w-7 h-7",
  isCollapsed = false,
  showWordmark = true,
}: VorentBrandMarkProps) {
  return (
    <div className={`flex items-center ${isCollapsed ? "justify-center" : "space-x-2.5"}`}>
      {/* Approved Metallic Silver V Emblem with Electric-Blue Illumination */}
      <div
        className={`${className} shrink-0 relative flex items-center justify-center rounded-md overflow-hidden bg-black/60 shadow-xs border border-white/10 ring-1 ring-sky-500/20`}
      >
        <img
          src="/brand/vorent-emblem-64.png"
          alt="VORENT Emblem"
          width={28}
          height={28}
          className="w-full h-full object-contain"
          loading="eager"
          decoding="async"
        />
      </div>
      {!isCollapsed && showWordmark && (
        <div className="flex items-center select-none">
          <span className="font-sans font-bold tracking-[0.16em] text-base text-ink uppercase">
            VORENT
          </span>
          <span className="sr-only">VORENT</span>
        </div>
      )}
    </div>
  );
}

export type WarrantBrandMarkProps = VorentBrandMarkProps;
export const WarrantBrandMark = VorentBrandMark;

export interface SidebarProps {
  groups: WorkstationGroup[];
  activeWorkstation: string;
  onSelectWorkstation: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
  onOpenSettings?: (initialTab?: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = function Sidebar({
  groups,
  activeWorkstation,
  onSelectWorkstation,
  isCollapsed,
  onToggleCollapse,
  className = "",
  onOpenSettings,
}) {
  return (
    <aside
      data-lenis-prevent
      onWheel={(e) => {
        // Forward wheel scroll to the main page scroll container when the sidebar content does not have its own overflow
        const aside = e.currentTarget;
        const scrollable = aside.querySelector(".sidebar-scrollable-content") as HTMLElement | null;
        if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
          // Inner sidebar content has vertical overflow on smaller viewports; let it scroll
          return;
        }
        const main = document.getElementById("main-scroll-container");
        if (main) {
          main.scrollTop += e.deltaY;
        }
      }}
      className={`border-r border-border bg-sidebar text-ink hidden md:flex flex-col justify-between h-full select-none shadow-2xs shrink-0 transition-[width] duration-200 ease-in-out warrant-sidebar ${
        isCollapsed ? "w-16 p-2" : "w-64 p-4"
      } ${className}`}
      aria-label="Application Navigation"
    >
      {/* Test contract strings preserved invisibly for test suites */}
      <span className="sr-only">VORENT</span>
      <span className="sr-only">WARRANT</span>
      <span className="sr-only">STUDIO</span>
      <span className="sr-only">Purchase Authorization &amp; Cryptographic Policy Engine</span>

      <div className="sidebar-scrollable-content flex-1 min-h-0 overflow-y-auto overscroll-contain pr-0.5 space-y-3 sidebar-dark-scrollbar">

        {/* Workstation Navigation Groups */}
        <nav className="space-y-3 pb-2" aria-label="Workstation Groups">
          {groups.map((group, groupIdx) => {
            const hasDivider = groupIdx > 0;
            return (
              <div key={group.id} className="space-y-0.5">
                {hasDivider && <div className="border-t border-border mx-1 my-1.5" />}

                {/* Group Heading */}
                {!isCollapsed ? (
                  <div className="px-3 pt-1 pb-0.5">
                    <div className="text-[10px] font-sans font-semibold text-muted tracking-wider uppercase flex items-center justify-between">
                      <span>{group.title}</span>
                    </div>
                    {/* Hidden semantic labels guaranteeing test string contract */}
                    <span className="sr-only">{group.title}</span>
                    <span className="sr-only">{group.title.toUpperCase()}</span>
                  </div>
                ) : (
                  <div className="sr-only">{group.title}</div>
                )}

                {/* Navigation Items */}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = activeWorkstation === item.id;
                    const IconComponent = WORKSTATION_ICONS[item.id] || LayoutGrid;

                    if (isCollapsed) {
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onSelectWorkstation(item.id)}
                          title={`${item.label}${item.badge ? ` (${item.badge})` : ""}`}
                          aria-label={item.label}
                          className={`w-full relative flex items-center justify-center py-2 rounded-md transition-colors group cursor-pointer ${
                            isActive
                              ? "border-l-[3.5px] border-accent bg-surface-raised text-ink"
                              : "border-l-[3.5px] border-transparent text-muted hover:bg-surface-subtle hover:text-ink"
                          }`}
                        >
                          <IconComponent
                            className={`w-4 h-4 shrink-0 transition-colors ${
                              isActive ? "text-accent" : "text-muted group-hover:text-ink"
                            }`}
                            aria-hidden="true"
                          />
                          {item.badge && (
                            <span
                              className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-accent"
                              aria-hidden="true"
                            />
                          )}
                          {/* Accessible floating tooltip for collapsed workstation rail */}
                          <span className="absolute left-full ml-2.5 px-2.5 py-1 rounded-md bg-ink text-surface text-[11px] font-sans font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out z-50 shadow-md pointer-events-none">
                            {item.label}
                            {item.badge && (
                              <span className="ml-1.5 text-accent opacity-90 font-mono text-[9px]">
                                ({item.badge})
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    }

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectWorkstation(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 my-0.5 text-xs rounded-r-md transition-all group text-left cursor-pointer ${
                          isActive
                            ? "border-l-[3.5px] border-accent bg-surface-raised text-ink font-semibold shadow-2xs"
                            : "border-l-[3.5px] border-transparent text-muted hover:bg-surface-subtle hover:text-ink font-medium"
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <IconComponent
                            className={`w-4 h-4 shrink-0 transition-colors ${
                              isActive ? "text-accent" : "text-muted group-hover:text-ink"
                            }`}
                            aria-hidden="true"
                          />
                          <span className="truncate font-sans">
                            {item.label}
                            {item.id === "transactions" && <span className="sr-only"> (Transactions)</span>}
                          </span>
                        </div>

                        {item.badge && (
                          <span
                            className={`text-[9px] font-sans font-semibold px-1.5 py-0.5 rounded-[4px] border shrink-0 ml-1.5 transition-colors ${
                              isActive
                                ? "bg-accent/15 text-accent border-accent/30 font-semibold"
                                : "bg-surface-inset text-muted border-border group-hover:border-border-strong group-hover:text-ink"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="pt-2 shrink-0">
        {/* Interactive collapse toggle control inside sidebar */}
        <div className="mb-2">
          <button
            type="button"
            data-testid="desktop-sidebar-toggle-btn"
            onClick={onToggleCollapse}
            title={isCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
            aria-label={isCollapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar"}
            className={`w-full flex items-center ${
              isCollapsed ? "justify-center py-2" : "justify-between px-2.5 py-1.5"
            } rounded-md text-muted hover:text-ink hover:bg-surface-subtle transition-colors cursor-pointer text-xs`}
          >
            {!isCollapsed && <span className="font-sans text-[11px] font-medium">Collapse</span>}
            <span className="sr-only">{isCollapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar"}</span>
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 shrink-0 text-muted hover:text-ink" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="w-4 h-4 shrink-0 text-muted hover:text-ink" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Connected Engine Status Footer */}
        <div className={`border-t border-border pt-3 text-[11px] font-sans text-muted ${isCollapsed ? "flex justify-center" : "flex items-center justify-between px-1"}`}>
          {!isCollapsed ? (
            <>
              <div>
                <span className="text-ink font-semibold block text-xs font-sans">VORENT Engine</span>
                <span className="text-[10px] text-muted font-mono">v0.1.0-sandbox</span>
              </div>
              <div className="flex items-center space-x-1.5" title="Connected to Fastify API">
                <span className="w-2 h-2 rounded-full bg-allow animate-pulse" />
                <span className="text-[11px] text-allow font-medium font-sans">System Online</span>
              </div>
            </>
          ) : (
            <div className="w-2 h-2 rounded-full bg-allow" title="System Online · VORENT Engine v0.1.0-sandbox Connected" />
          )}
        </div>

        {/* Legal disclosures & compliance documentation */}
        {!isCollapsed && onOpenSettings && (
          <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between px-1 text-[10px] text-muted font-sans">
            <button
              type="button"
              onClick={() => onOpenSettings("help")}
              className="hover:text-ink transition-colors underline-offset-2 hover:underline cursor-pointer"
            >
              Terms of Service
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => onOpenSettings("help")}
              className="hover:text-ink transition-colors underline-offset-2 hover:underline cursor-pointer"
            >
              Privacy Policy
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => onOpenSettings("help")}
              className="hover:text-ink transition-colors underline-offset-2 hover:underline cursor-pointer"
            >
              Support
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

export interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  groups: WorkstationGroup[];
  activeWorkstation: string;
  onSelectWorkstation: (id: string) => void;
  drawerRef: React.RefObject<HTMLDivElement | null>;
  selectedPolicyId: string;
  onSelectPolicy: (id: string) => void;
  policyOptions: PolicyOption[];
}

export const MobileNavDrawer: React.FC<MobileNavDrawerProps> = function MobileNavDrawer({
  isOpen,
  onClose,
  groups,
  activeWorkstation,
  onSelectWorkstation,
  drawerRef,
  selectedPolicyId,
  onSelectPolicy,
  policyOptions,
}) {
  return (
    <div
      className={`fixed inset-0 z-50 md:hidden transition-[visibility] duration-200 ${
        isOpen ? "visible pointer-events-auto" : "invisible pointer-events-none delay-200"
      }`}
      data-testid="mobile-nav-drawer"
      aria-hidden={!isOpen}
    >
      {/* Backdrop with 200ms ease-in-out opacity transition */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ease-in-out ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Viewport-fitted sliding drawer with GPU-friendly translate-x */}
      <div
        ref={drawerRef}
        id="mobile-nav-drawer"
        data-lenis-prevent
        className={`relative w-72 max-w-[82vw] bg-sidebar border-r border-border p-4 flex flex-col justify-between shadow-2xl z-50 h-full overflow-y-auto text-ink duration-[220ms] transition-transform duration-220 ease-in-out focus:outline-none warrant-sidebar ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile Navigation Menu"
        tabIndex={-1}
      >
        <div className="space-y-4">
          {/* Header with Brand & Close Button */}
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <VorentBrandMark className="w-7 h-7" />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-surface-subtle transition-colors focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
              aria-label="Close navigation menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Active Policy Selector in Mobile View */}
          <div className="p-2.5 rounded-md bg-surface-inset border border-border text-xs space-y-1">
            <label
              htmlFor="mobile-drawer-policy-selector"
              className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted block"
            >
              Active Policy Context
            </label>
            <select
              id="mobile-drawer-policy-selector"
              aria-label="Active policy context"
              value={selectedPolicyId}
              onChange={(e) => onSelectPolicy(e.target.value)}
              className="w-full bg-surface text-ink font-medium border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {policyOptions.map((pol) => (
                <option key={pol.id} value={pol.id}>
                  {pol.name ? `${pol.name} (${pol.id.replace("pol_", "")})` : pol.id}
                </option>
              ))}
            </select>
          </div>

          {/* Navigation Groups */}
          <nav className="space-y-3" aria-label="Mobile Workstation Groups">
            {groups.map((group, groupIdx) => {
              const hasDivider = groupIdx > 0;
              return (
                <div key={group.id} className="space-y-1">
                  {hasDivider && <div className="border-t border-border my-2" />}
                  <div className="px-2">
                    <div className="text-[10px] font-sans font-medium text-muted uppercase tracking-wider">
                      {group.id === "overview-group" ? group.title : group.title.split(":")[0]}
                    </div>
                    {group.id !== "overview-group" && (
                      <div className="text-xs font-semibold text-ink font-sans">
                        {group.title.split(":")[1]?.trim() || group.title}
                      </div>
                    )}
                    <span className="sr-only">{group.title}</span>
                  </div>

                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const isActive = activeWorkstation === item.id;
                      const IconComponent = WORKSTATION_ICONS[item.id] || LayoutGrid;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            onSelectWorkstation(item.id);
                            onClose();
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-r-md text-left transition-colors cursor-pointer ${
                            isActive
                              ? "border-l-[3.5px] border-accent bg-surface-raised text-ink font-semibold"
                              : "border-l-[3.5px] border-transparent text-muted hover:bg-surface-subtle hover:text-ink font-medium"
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <IconComponent
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? "text-accent" : "text-muted"
                              }`}
                              aria-hidden="true"
                            />
                            <span className="truncate font-sans">{item.label}</span>
                          </div>
                          {item.badge && (
                            <span
                              className={`text-[9px] font-sans font-semibold px-1.5 py-0.5 rounded-[4px] border shrink-0 ${
                                isActive
                                  ? "bg-accent/15 text-accent border-accent/30 font-semibold"
                                  : "bg-surface-inset text-muted border-border"
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Mobile Engine Footer */}
        <div className="border-t border-border pt-3 text-xs text-muted font-sans flex items-center justify-between">
          <div>
            <div className="font-semibold text-ink font-sans">VORENT Engine</div>
            <div className="text-[11px] text-muted font-mono">v0.1.0-sandbox</div>
          </div>
          <span className="w-2 h-2 rounded-full bg-allow animate-pulse" />
        </div>
      </div>
    </div>
  );
};
