import React, { useState, useRef, useEffect } from "react";
import { User, LogOut, ChevronDown, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { useAuth } from "../../providers/AuthContext";

export const UserNavIndicator: React.FC = () => {
  const { user, isAuthenticated, logout, openAuthModal, switchPersona } = useAuth();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [dropdownOpen]);

  if (!isAuthenticated || !user) {
    return (
      <button
        type="button"
        onClick={() => openAuthModal("login")}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-surface-bg font-medium text-xs hover:opacity-95 transition-opacity cursor-pointer shadow-xs"
      >
        <User className="w-3.5 h-3.5" />
        <span>Sign In</span>
      </button>
    );
  }

  // Format role label & color tokens
  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case "ADMINISTRATOR":
        return "bg-purple-500/10 text-purple-400 border-purple-500/30";
      case "APPROVER":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "FINANCE_AUDITOR":
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      case "REQUESTER":
      default:
        return "bg-accent/10 text-accent border-accent/30";
    }
  };

  return (
    <div className="relative" ref={dropdownRef} data-testid="user-nav-indicator">
      <button
        type="button"
        data-testid="user-nav-button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 p-1.5 pl-2 rounded-lg bg-surface border border-border hover:border-accent/40 transition-colors text-xs text-ink cursor-pointer group"
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
      >
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold">
            {(user.name || user.email).charAt(0).toUpperCase()}
          </div>
          <span className="font-medium text-ink hidden sm:inline max-w-[120px] truncate">
            {user.name || user.email.split("@")[0]}
          </span>
        </div>

        <span
          className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-md border font-semibold ${getRoleBadgeStyle(
            user.role
          )}`}
        >
          {user.role.replace("_", " ")}
        </span>

        <ChevronDown className="w-3.5 h-3.5 text-ink-muted group-hover:text-ink transition-transform" />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl bg-surface-raised border border-border shadow-2xl p-3 z-[100] text-xs text-ink animate-in fade-in slide-in-from-top-2 duration-150">
          {/* User profile summary */}
          <div className="pb-3 border-b border-border/60">
            <div className="font-semibold text-ink truncate">{user.name || "Warrant User"}</div>
            <div className="text-[11px] text-ink-muted font-mono truncate">{user.email}</div>
            <div className="mt-2 flex items-center gap-1 text-[10px] text-ink-muted">
              <ShieldCheck className="w-3.5 h-3.5 text-accent" />
              <span>Role: <strong className="text-ink">{user.role}</strong></span>
            </div>
          </div>

          {/* Quick role / persona switch */}
          <div className="py-2.5 border-b border-border/60">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[10px] font-semibold uppercase text-ink-muted tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-accent" /> Switch Persona
              </span>
              <span className="text-[9px] text-ink-muted">Evaluation</span>
            </div>

            <div className="space-y-1">
              {[
                { email: "admin@warrant.studio", role: "ADMINISTRATOR", label: "Administrator" },
                { email: "approver@warrant.studio", role: "APPROVER", label: "Approver" },
                { email: "auditor@warrant.studio", role: "FINANCE_AUDITOR", label: "Finance Auditor" },
                { email: "requester@warrant.studio", role: "REQUESTER", label: "Requester" },
              ].map((p) => {
                const isActive = user.email.toLowerCase() === p.email.toLowerCase();
                return (
                  <button
                    key={p.email}
                    type="button"
                    onClick={async () => {
                      setDropdownOpen(false);
                      if (!isActive) {
                        await switchPersona(p.email);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                      isActive
                        ? "bg-accent/15 text-accent font-medium border border-accent/30"
                        : "hover:bg-surface text-ink-muted hover:text-ink"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <UserCheck className={`w-3.5 h-3.5 ${isActive ? "text-accent" : "opacity-40"}`} />
                      <span className="text-xs">{p.label}</span>
                    </div>
                    <span className="text-[9px] font-mono px-1 rounded bg-surface border border-border">
                      {p.role.split("_")[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setDropdownOpen(false);
                openAuthModal("login");
              }}
              className="text-[11px] text-ink-muted hover:text-ink transition-colors cursor-pointer"
            >
              Add Account
            </button>
            <button
              type="button"
              onClick={async () => {
                setDropdownOpen(false);
                await logout();
              }}
              className="inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 transition-colors cursor-pointer"
            >
              <LogOut className="w-3 h-3" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
