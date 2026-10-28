import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Settings,
  LogOut,
  ChevronUp,
  ShieldCheck,
  Building2,
  Check,
  Users,
  HelpCircle,
  FileText,
} from "lucide-react";
import { useAuth } from "../../providers/AuthContext";
import type { UserProfile } from "@warrant/contracts";
import { accountService } from "../../api/accountService";

export interface SidebarAccountMenuProps {
  isCollapsed: boolean;
  onOpenSettings?: (initialTab?: string) => void;
  onLogout?: () => void;
  className?: string;
}

export const SidebarAccountMenu: React.FC<SidebarAccountMenuProps> = ({
  isCollapsed,
  onOpenSettings,
  onLogout,
  className = "",
}) => {
  const { user, isAuthenticated, logout, switchPersona, personas } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ left: number; bottom: number; width: number }>({
    left: 0,
    bottom: 0,
    width: 240,
  });
  const [showPersonaSubmenu, setShowPersonaSubmenu] = useState(false);

  const activeMenuIndexRef = useRef<number>(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // Fetch full profile when authenticated
  const loadProfile = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await accountService.getProfile();
      setProfile(res);
    } catch {
      // In standalone/offline mode, fallback to user from auth context
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile, user]);

  // Calculate robust viewport positioning directly above the account control
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownWidth = isCollapsed ? 260 : Math.max(rect.width, 240);
    const bottomOffset = window.innerHeight - rect.top + 8; // 8px gap above button
    let leftOffset = rect.left;

    // Viewport right edge protection
    if (leftOffset + dropdownWidth > window.innerWidth - 12) {
      leftOffset = Math.max(12, window.innerWidth - dropdownWidth - 12);
    }

    setDropdownPosition({
      left: Math.max(8, leftOffset),
      bottom: Math.max(12, bottomOffset),
      width: dropdownWidth,
    });
  }, [isCollapsed]);

  // Update position on window resize or scroll
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleResize = () => updatePosition();
      window.addEventListener("resize", handleResize);
      window.addEventListener("scroll", handleResize, true);
      return () => {
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("scroll", handleResize, true);
      };
    }
  }, [isOpen, updatePosition]);

  // Outside click dismissal
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        isOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setShowPersonaSubmenu(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      return () => document.removeEventListener("mousedown", handleOutsideClick);
    }
  }, [isOpen]);

  // Escape key dismissal and keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        setShowPersonaSubmenu(false);
        buttonRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = (activeMenuIndexRef.current + 1) % menuItemsRef.current.length;
        activeMenuIndexRef.current = next;
        menuItemsRef.current[next]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = activeMenuIndexRef.current;
        const next = prev <= 0 ? menuItemsRef.current.length - 1 : prev - 1;
        activeMenuIndexRef.current = next;
        menuItemsRef.current[next]?.focus();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen]);

  const toggleMenu = () => {
    if (!isOpen) {
      updatePosition();
      activeMenuIndexRef.current = -1;
      setShowPersonaSubmenu(false);
    }
    setIsOpen((prev) => !prev);
  };

  const displayName = profile?.name || user?.name || user?.email?.split("@")[0] || "Operator";
  const userEmail = profile?.email || user?.email || "operator@warrant.studio";
  const userRole = profile?.role || user?.role || "REQUESTER";
  const orgName = profile?.organizationName || "Warrant Enterprise HQ";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "W";

  const getRoleBadgeClasses = (role: string) => {
    switch (role) {
      case "ADMINISTRATOR":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30";
      case "APPROVER":
        return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";
      case "FINANCE_AUDITOR":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30";
      default:
        return "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30";
    }
  };

  return (
    <div className={`relative ${className}`} data-testid="sidebar-account-container">
      {/* Account Control Button at bottom of sidebar */}
      <button
        ref={buttonRef}
        type="button"
        data-testid="sidebar-account-btn"
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`User account menu for ${displayName}`}
        className={`w-full flex items-center rounded-lg transition-colors cursor-pointer text-left select-none group focus:outline-none focus:ring-1 focus:ring-accent ${
          isCollapsed
            ? "justify-center p-2 hover:bg-surface-subtle"
            : "justify-between p-2 hover:bg-surface-subtle"
        } ${isOpen ? "bg-surface-raised ring-1 ring-border" : ""}`}
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          {/* Avatar / Initials Circle */}
          <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/40 text-accent font-sans font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
            {initials}
          </div>

          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-ink truncate leading-tight">
                {displayName}
              </div>
              <div className="text-[10px] text-muted truncate font-sans flex items-center space-x-1 mt-0.5">
                <span className="truncate">{orgName}</span>
                <span>·</span>
                <span className="font-mono uppercase font-semibold text-[9px] text-accent">
                  {userRole.replace("_", " ")}
                </span>
              </div>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <ChevronUp
            className={`w-4 h-4 text-muted group-hover:text-ink transition-transform duration-150 shrink-0 ${
              isOpen ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Floating Dropdown positioned directly above button via React Portal */}
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            data-testid="sidebar-account-dropdown"
            role="menu"
            aria-label="Account Settings and Management"
            style={{
              position: "fixed",
              left: `${dropdownPosition.left}px`,
              bottom: `${dropdownPosition.bottom}px`,
              width: `${dropdownPosition.width}px`,
              maxHeight: "calc(100vh - 24px)",
            }}
            className="z-[9999] rounded-xl border border-[#DFE4DC] dark:border-slate-700 bg-[#F7F5EF] dark:bg-[#14263D] text-[#24352D] dark:text-[#F8FAFC] shadow-2xl p-2 font-sans text-xs overflow-y-auto animate-in fade-in zoom-in-95 duration-150 motion-interactive"
          >
            {/* Header: User Profile Summary Card */}
            <div className="p-2.5 mb-1.5 rounded-lg bg-[#EAE8DF] dark:bg-[#0E1A2B] border border-[#DFE4DC] dark:border-slate-700/80">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-full bg-accent/20 border border-accent/40 text-accent font-sans font-bold text-xs flex items-center justify-center shrink-0">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-xs text-[#12372A] dark:text-white truncate">
                    {displayName}
                  </div>
                  <div className="text-[10px] text-muted font-mono truncate">{userEmail}</div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-[#DFE4DC]/80 dark:border-slate-700/60 flex items-center justify-between text-[10px]">
                <span className="text-muted flex items-center space-x-1">
                  <ShieldCheck className="w-3 h-3 text-accent" aria-hidden="true" />
                  <span>Authority:</span>
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase font-bold border ${getRoleBadgeClasses(
                    userRole
                  )}`}
                >
                  {userRole.replace("_", " ")}
                </span>
              </div>
            </div>

            {/* Organization / Workspace Context */}
            <div className="px-2 py-1.5 mb-1 rounded-md bg-white/60 dark:bg-slate-800/40 border border-[#DFE4DC]/80 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
              <div className="flex items-center space-x-2 min-w-0">
                <Building2 className="w-3.5 h-3.5 text-[#12372A] dark:text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="font-medium text-[#12372A] dark:text-slate-200 truncate">{orgName}</span>
              </div>
              <span className="inline-flex items-center space-x-1 text-[9px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold shrink-0">
                <Check className="w-3 h-3" />
                <span>Active</span>
              </span>
            </div>

            {/* Menu Items Group */}
            <div className="space-y-0.5">
              {/* Settings Hub Link */}
              <button
                ref={(el) => {
                  menuItemsRef.current[0] = el;
                }}
                type="button"
                role="menuitem"
                data-testid="account-menu-settings-btn"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings?.("profile");
                }}
                className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-md hover:bg-[#EAE8DF] dark:hover:bg-slate-800 text-[#24352D] dark:text-slate-200 transition-colors cursor-pointer text-left focus:outline-none focus:bg-[#EAE8DF] dark:focus:bg-slate-800"
              >
                <Settings className="w-4 h-4 text-[#12372A] dark:text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="font-medium">Settings &amp; Preferences</span>
              </button>

              {/* Persona Switcher Toggle */}
              <button
                ref={(el) => {
                  menuItemsRef.current[1] = el;
                }}
                type="button"
                role="menuitem"
                data-testid="account-menu-personas-btn"
                onClick={() => setShowPersonaSubmenu((prev) => !prev)}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-[#EAE8DF] dark:hover:bg-slate-800 text-[#24352D] dark:text-slate-200 transition-colors cursor-pointer text-left focus:outline-none focus:bg-[#EAE8DF] dark:focus:bg-slate-800"
              >
                <div className="flex items-center space-x-2.5">
                  <Users className="w-4 h-4 text-[#12372A] dark:text-emerald-400 shrink-0" aria-hidden="true" />
                  <span className="font-medium">Switch Persona</span>
                </div>
                <span className="text-[10px] text-muted font-mono">{showPersonaSubmenu ? "▲" : "▼"}</span>
              </button>

              {/* Persona Switcher Submenu */}
              {showPersonaSubmenu && (
                <div className="pl-6 pr-1 py-1 space-y-1 bg-white/40 dark:bg-slate-900/40 rounded-md border border-[#DFE4DC]/60 dark:border-slate-800">
                  {personas && personas.length > 0 ? (
                    personas.map((p) => (
                      <button
                        key={p.email}
                        type="button"
                        onClick={async () => {
                          await switchPersona(p.email, p.passwordHint);
                          setIsOpen(false);
                          setShowPersonaSubmenu(false);
                        }}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-[11px] transition-colors cursor-pointer ${
                          userEmail === p.email
                            ? "bg-accent/15 text-accent font-bold"
                            : "hover:bg-[#EAE8DF] dark:hover:bg-slate-800 text-[#24352D] dark:text-slate-300"
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        {userEmail === p.email && <Check className="w-3 h-3 text-accent shrink-0 ml-1" />}
                      </button>
                    ))
                  ) : (
                    <div className="text-[10px] text-muted p-1">No personas available</div>
                  )}
                </div>
              )}

              {/* Documentation & Help */}
              <button
                ref={(el) => {
                  menuItemsRef.current[2] = el;
                }}
                type="button"
                role="menuitem"
                data-testid="account-menu-help-btn"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings?.("help");
                }}
                className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-md hover:bg-[#EAE8DF] dark:hover:bg-slate-800 text-[#24352D] dark:text-slate-200 transition-colors cursor-pointer text-left focus:outline-none focus:bg-[#EAE8DF] dark:focus:bg-slate-800"
              >
                <HelpCircle className="w-4 h-4 text-[#12372A] dark:text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="font-medium">Help &amp; Documentation</span>
              </button>

              {/* Privacy & Legal */}
              <button
                ref={(el) => {
                  menuItemsRef.current[3] = el;
                }}
                type="button"
                role="menuitem"
                data-testid="account-menu-privacy-btn"
                onClick={() => {
                  setIsOpen(false);
                  onOpenSettings?.("privacy");
                }}
                className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-md hover:bg-[#EAE8DF] dark:hover:bg-slate-800 text-[#24352D] dark:text-slate-200 transition-colors cursor-pointer text-left focus:outline-none focus:bg-[#EAE8DF] dark:focus:bg-slate-800"
              >
                <FileText className="w-4 h-4 text-[#12372A] dark:text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="font-medium">Privacy Policy &amp; Terms</span>
              </button>

              {/* Divider */}
              <div className="border-t border-[#DFE4DC] dark:border-slate-700/80 my-1" />

              {/* Log Out */}
              <button
                ref={(el) => {
                  menuItemsRef.current[4] = el;
                }}
                type="button"
                role="menuitem"
                data-testid="account-menu-logout-btn"
                onClick={async () => {
                  setIsOpen(false);
                  await logout();
                  onLogout?.();
                }}
                className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-md hover:bg-red-500/10 text-red-700 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors cursor-pointer text-left focus:outline-none focus:bg-red-500/10"
              >
                <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="font-semibold">Log out</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
