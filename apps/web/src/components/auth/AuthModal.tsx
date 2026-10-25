import React, { useState, useEffect } from "react";
import { X, Shield, Lock, Mail, User, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "../../providers/AuthContext";

export const AuthModal: React.FC = () => {
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalTab,
    login,
    register,
    switchPersona,
    error,
    clearError,
  } = useAuth();


  const [tab, setTab] = useState<"login" | "register">(authModalTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setTab(authModalTab);
    clearError();
  }, [authModalTab, isAuthModalOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isAuthModalOpen) {
        closeAuthModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthModalOpen, closeAuthModal]);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (tab === "login") {
        await login(email, password);
      } else {
        await register(email, password, name.trim() || undefined);
      }
    } catch {
      // Error handled in context
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePersonaClick = async (pEmail: string) => {
    setIsSubmitting(true);
    try {
      await switchPersona(pEmail);
      closeAuthModal();
    } catch {
      // Handled in context
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-xl sm:max-w-2xl bg-panel border border-border text-ink rounded-xl shadow-2xl p-5 sm:p-6 relative max-h-[min(90vh,680px)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-surface border border-border text-accent">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 id="auth-modal-title" className="text-base font-semibold tracking-tight text-ink">
                {tab === "login" ? "Sign In to Warrant Studio" : "Create Requester Account"}
              </h2>
              <p className="text-xs text-ink-muted">
                Enterprise policy governance & authorization
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeAuthModal}
            className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 my-3 p-1 bg-surface rounded-lg border border-border/40">
          <button
            type="button"
            onClick={() => {
              setTab("login");
              clearError();
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              tab === "login"
                ? "bg-panel text-ink shadow-xs border border-border"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("register");
              clearError();
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              tab === "register"
                ? "bg-panel text-ink shadow-xs border border-border"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Master Brief 7.2 Safety Notice on Register */}
        {tab === "register" && (
          <div className="mb-3 px-3 py-2 bg-accent/10 border border-accent/25 rounded-lg text-xs text-ink flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
            <div className="text-[11px] leading-tight">
              <span className="font-semibold">Least-Privilege Default:</span> Public signups receive the safe{" "}
              <span className="font-mono font-medium text-accent">REQUESTER</span> role. Higher authority roles require governance assignment.
            </div>
          </div>
        )}

        {/* Error alert banner */}
        {error && (
          <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Auth form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {tab === "register" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-2.5 text-ink-muted" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-surface border border-border rounded-lg text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-muted mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-2.5 text-ink-muted" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full pl-9 pr-3 py-2 text-xs bg-surface border border-border rounded-lg text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-ink-muted" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-surface border border-border rounded-lg text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">
              Password {tab === "register" && "(min 8 characters)"}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-2.5 text-ink-muted" />
              <input
                type="password"
                required
                minLength={tab === "register" ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-3 py-2 text-xs bg-surface border border-border rounded-lg text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-2.5 px-4 bg-accent text-white dark:text-slate-950 font-bold text-xs rounded-lg hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-sm tracking-wide"
          >
            {isSubmitting ? (
              <span>Processing...</span>
            ) : tab === "login" ? (
              <span>Sign In</span>
            ) : (
              <span>Register Account</span>
            )}
          </button>
        </form>

        {/* Quick Persona Switcher for Evaluation */}
        <div className="mt-4 pt-3.5 border-t border-border/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Evaluation Starter Personas
            </span>
            <span className="text-[10px] text-ink-muted">1-Click Quick Fill</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { email: "admin@warrant.studio", role: "ADMINISTRATOR", label: "Admin" },
              { email: "approver@warrant.studio", role: "APPROVER", label: "Approver" },
              { email: "auditor@warrant.studio", role: "FINANCE_AUDITOR", label: "Auditor" },
              { email: "requester@warrant.studio", role: "REQUESTER", label: "Requester" },
            ].map((p) => (
              <button
                key={p.email}
                type="button"
                disabled={isSubmitting}
                onClick={() => handlePersonaClick(p.email)}
                className="text-left p-2 rounded-lg bg-surface border border-border hover:border-accent/50 hover:bg-surface-subtle transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-ink group-hover:text-accent">
                    {p.label}
                  </span>
                  <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-panel border border-border text-ink-muted">
                    {p.role.split("_")[0]}
                  </span>
                </div>
                <div className="text-[10px] text-ink-muted truncate mt-0.5 font-mono">
                  {p.email}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
