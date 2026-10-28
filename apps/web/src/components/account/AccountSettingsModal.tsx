import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  User,
  Shield,
  Building2,
  KeyRound,
  Sliders,
  Radio,
  History,
  HelpCircle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Cpu,
  Database,
  UserPlus,
  Users,
  Binary,
  Lock,
  Layers,
  Award,
  Terminal,
  Compass,
} from "lucide-react";
import { useAuth } from "../../providers/AuthContext";
import { useTheme } from "../../providers/ThemeProvider";
import { accountService } from "../../api/accountService";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type {
  UserProfile,
  UserPreferences,
  AccountActivityItem,
  ConnectedServicesResponse,
  OrganizationDetails,
} from "@warrant/contracts";

export const INSTITUTIONAL_AVATAR_ICONS = [
  { id: "shield", label: "Security Shield", icon: Shield },
  { id: "user", label: "Operator Profile", icon: User },
  { id: "building", label: "Enterprise HQ", icon: Building2 },
  { id: "key", label: "Cryptographic Key", icon: KeyRound },
  { id: "cpu", label: "Compute Engine", icon: Cpu },
  { id: "database", label: "Ledger Persistence", icon: Database },
  { id: "binary", label: "Compiler Engine", icon: Binary },
  { id: "lock", label: "Access Vault", icon: Lock },
  { id: "layers", label: "Policy Stack", icon: Layers },
  { id: "award", label: "Audit Attestation", icon: Award },
  { id: "terminal", label: "Command Shell", icon: Terminal },
  { id: "compass", label: "Governance Compass", icon: Compass },
] as const;

export interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
}

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = "profile",
}) => {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const normalizeTab = (tab?: string) => (tab === "privacy" ? "help" : tab || "profile");
  const [activeTab, setActiveTab] = useState<string>(() => normalizeTab(initialTab));

  // Profile Form state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>("icon:user");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [bio, setBio] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Preferences Form state
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<"system" | "light" | "dark">("system");
  const [defaultPolicyId, setDefaultPolicyId] = useState("pol_v1_books_hardware");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSuccess, setPrefsSuccess] = useState<string | null>(null);

  // Password Change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Sessions, Activity, Integrations, Organization state
  const [sessions, setSessions] = useState<Array<{ id: string; createdAt: string; expiresAt: string; isCurrent: boolean }>>([]);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [sessionRevokeError, setSessionRevokeError] = useState<string | null>(null);
  const [activity, setActivity] = useState<AccountActivityItem[]>([]);
  const [integrations, setIntegrations] = useState<ConnectedServicesResponse | null>(null);
  const [organization, setOrganization] = useState<OrganizationDetails | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const modalRef = useFocusTrap(isOpen, onClose);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(normalizeTab(initialTab));
    }
  }, [initialTab]);

  const loadAllData = useCallback(async () => {
    if (!isOpen) return;
    setLoadingData(true);
    try {
      const [profData, prefData, sessData, actData, integData, orgData] = await Promise.all([
        accountService.getProfile().catch(() => null),
        accountService.getPreferences().catch(() => null),
        accountService.getSessions().catch(() => []),
        accountService.getActivity().catch(() => []),
        accountService.getConnectedServices().catch(() => null),
        accountService.getOrganization().catch(() => null),
      ]);

      if (profData) {
        setProfile(profData);
        setName(profData.name || "");
        setJobTitle(profData.jobTitle || "");
        setDepartment(profData.department || "");
        setPhoneNumber(profData.phoneNumber || "");
        setBio(profData.bio || "");
        setAvatarUrl(profData.avatarUrl || "icon:user");
      }
      if (prefData) {
        setPreferences(prefData);
        setSelectedTheme(prefData.theme);
        setDefaultPolicyId(prefData.defaultPolicyId || "pol_v1_books_hardware");
        setEmailNotifications(prefData.emailNotifications);
      }
      setSessions(sessData);
      setActivity(actData);
      setIntegrations(integData);
      if (orgData) {
        setOrganization(orgData);
      }
    } finally {
      setLoadingData(false);
    }
  }, [isOpen]);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileSuccess(null);
    setProfileError(null);
    try {
      const updated = await accountService.updateProfile({
        name,
        avatarUrl,
        jobTitle,
        department,
        phoneNumber,
        bio,
      });
      setProfile(updated);
      setProfileSuccess("Profile updated successfully.");
      setTimeout(() => setProfileSuccess(null), 3000);
    } catch (err: any) {
      setProfileError(err?.message || "Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrefsSaving(true);
    setPrefsSuccess(null);
    try {
      const updated = await accountService.updatePreferences({
        theme: selectedTheme,
        defaultPolicyId,
        emailNotifications,
      });
      setPreferences(updated);
      setTheme(selectedTheme);
      setPrefsSuccess("Preferences saved successfully.");
      setTimeout(() => setPrefsSuccess(null), 3000);
    } finally {
      setPrefsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSaving(true);
    setPasswordSuccess(null);
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      setPasswordSaving(false);
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters long.");
      setPasswordSaving(false);
      return;
    }

    try {
      await accountService.changePassword({
        currentPassword,
        newPassword,
      });
      setPasswordSuccess("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(null), 3000);
    } catch (err: any) {
      const msg = err?.data?.error?.message || err?.message || "Failed to change password.";
      setPasswordError(msg);
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    setSessionRevokeError(null);
    try {
      await accountService.revokeSession(sessionId);
      await loadAllData();
    } catch (err: any) {
      setSessionRevokeError(err?.message || "Failed to revoke session.");
    } finally {
      setRevokingSessionId(null);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteSaving(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const newMember = await accountService.inviteMember({
        email: inviteEmail.trim(),
        name: inviteName.trim() || undefined,
        role: inviteRole,
      });
      setOrganization((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          members: [newMember, ...prev.members],
        };
      });
      setInviteSuccess(`Colleague ${inviteEmail} added to workspace.`);
      setInviteEmail("");
      setInviteName("");
      setTimeout(() => {
        setInviteSuccess(null);
        setInviteModalOpen(false);
      }, 1500);
    } catch (err: any) {
      const msg = err?.data?.error?.message || err?.message || "Failed to add colleague.";
      setInviteError(msg);
    } finally {
      setInviteSaving(false);
    }
  };

  const navTabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "security", label: "Security & Sign-in", icon: KeyRound },
    { id: "organization", label: "Organization & Workspace", icon: Building2 },
    { id: "roles", label: "Roles & Permissions", icon: Shield },
    { id: "preferences", label: "Preferences", icon: Sliders },
    { id: "integrations", label: "Connected Services", icon: Radio },
    { id: "activity", label: "Account Activity", icon: History },
    { id: "help", label: "Help & Legal", icon: HelpCircle },
  ];

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-settings-title"
      data-testid="account-settings-modal"
    >
      <div
        ref={modalRef}
        className="w-full max-w-4xl h-[90vh] max-h-[760px] flex flex-col rounded-xl border border-border bg-surface text-ink shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="h-14 px-6 border-b border-border bg-surface-raised flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 text-accent flex items-center justify-center font-bold">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 id="account-settings-title" className="font-bold text-sm text-ink font-sans flex items-center space-x-2">
                <span>Account Hub &amp; Governance Center</span>
                {loadingData && (
                  <RefreshCw className="w-3.5 h-3.5 text-accent animate-spin" aria-label="Loading..." />
                )}
              </h2>
              <p className="text-[10px] text-muted font-mono">
                {profile?.email || user?.email || "operator@warrant.studio"} · {profile?.organizationName || "Warrant Enterprise HQ"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="account-settings-close-btn"
            className="w-8 h-8 rounded-md hover:bg-surface-subtle text-muted hover:text-ink flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close Settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Left Tab Rail + Right Content Pane */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Left Tab Navigation */}
          <div className="w-full md:w-60 border-b md:border-b-0 md:border-r border-border bg-surface-subtle/50 p-2 md:p-3 shrink-0 overflow-x-auto md:overflow-y-auto no-scrollbar">
            <nav className="flex md:flex-col space-x-1 md:space-x-0 md:space-y-1" aria-label="Settings Tabs">
              {navTabs.map((t) => {
                const Icon = t.icon;
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    data-testid={`settings-tab-${t.id}`}
                    className={`flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left shrink-0 md:shrink cursor-pointer ${
                      isActive
                        ? "bg-primary text-white font-semibold shadow-2xs"
                        : "text-muted hover:bg-surface-subtle hover:text-ink"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-surface">
            {/* 1. Profile Tab */}
            {activeTab === "profile" && (
              <form onSubmit={handleSaveProfile} className="space-y-5 max-w-2xl font-sans" data-testid="profile-form">
                <div>
                  <h3 className="text-base font-bold text-ink">Personal Profile</h3>
                  <p className="text-xs text-muted">
                    Manage your identity details, authority icon, department, and operational contact information.
                  </p>
                </div>

                {profileSuccess && (
                  <div className="p-3 rounded-lg bg-allow/10 border border-allow/30 text-allow text-xs flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{profileSuccess}</span>
                  </div>
                )}
                {profileError && (
                  <div className="p-3 rounded-lg bg-deny/10 border border-deny/30 text-deny text-xs flex items-center space-x-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{profileError}</span>
                  </div>
                )}

                {/* Visual Institutional Profile Icon Selector */}
                <div className="space-y-2 p-3 sm:p-4 rounded-lg bg-surface-inset border border-border" data-testid="profile-icon-selector">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-[11px] font-semibold text-muted uppercase font-mono">
                        Authority Identity Icon
                      </label>
                      <p className="text-[11px] text-muted font-sans mt-0.5">
                        Choose your institutional insignia displayed across audit reports and navigation.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-surface border border-border text-ink shrink-0">
                      Active: {avatarUrl.replace("icon:", "")}
                    </span>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Authority Identity Icon"
                    className="grid grid-cols-4 sm:grid-cols-6 gap-2 pt-1"
                  >
                    {INSTITUTIONAL_AVATAR_ICONS.map((item) => {
                      const IconComp = item.icon;
                      const isSelected = avatarUrl === `icon:${item.id}`;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          aria-label={item.label}
                          data-testid={`profile-icon-opt-${item.id}`}
                          onClick={() => setAvatarUrl(`icon:${item.id}`)}
                          className={`flex flex-col items-center justify-center p-2 rounded-md border text-xs transition-all cursor-pointer ${
                            isSelected
                              ? "bg-accent/15 border-accent text-accent ring-2 ring-accent/30 font-semibold shadow-2xs"
                              : "bg-surface border-border text-muted hover:border-accent/40 hover:text-ink hover:bg-surface-subtle"
                          }`}
                        >
                          <IconComp className="w-4 h-4 mb-1 shrink-0" aria-hidden="true" />
                          <span className="text-[9px] font-mono truncate w-full text-center">
                            {item.id}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase font-mono mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className="w-full px-3 py-2 rounded-md border border-border bg-surface-inset text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase font-mono mb-1">
                      Email Address (Locked)
                    </label>
                    <input
                      type="email"
                      disabled
                      value={profile?.email || user?.email || ""}
                      className="w-full px-3 py-2 rounded-md border border-border bg-surface-inset/60 text-muted text-xs cursor-not-allowed font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase font-mono mb-1">
                      Job Title
                    </label>
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Lead Security Architect"
                      className="w-full px-3 py-2 rounded-md border border-border bg-surface-inset text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase font-mono mb-1">
                      Department
                    </label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="e.g. InfoSec &amp; Governance"
                      className="w-full px-3 py-2 rounded-md border border-border bg-surface-inset text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase font-mono mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="e.g. +1 (555) 019-2831"
                    className="w-full px-3 py-2 rounded-md border border-border bg-surface-inset text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase font-mono mb-1">
                    Professional Bio &amp; Scope
                  </label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Describe your governance responsibilities..."
                    className="w-full px-3 py-2 rounded-md border border-border bg-surface-inset text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent leading-relaxed"
                  />
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-[11px] text-muted font-mono">
                    Authority Role: <strong className="text-ink">{profile?.role || user?.role}</strong> (Immutable via Profile)
                  </span>
                  <button
                    type="submit"
                    disabled={profileSaving}
                    data-testid="save-profile-btn"
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-md bg-primary hover:bg-primary-hover active:bg-primary-active text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                  >
                    {profileSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{profileSaving ? "Saving..." : "Save Profile"}</span>
                  </button>
                </div>
              </form>
            )}

            {/* 2. Security & Sign-in Tab */}
            {activeTab === "security" && (
              <div className="space-y-6 max-w-2xl font-sans" data-testid="security-section">
                <div>
                  <h3 className="text-base font-bold text-ink">Security &amp; Sign-in Methods</h3>
                  <p className="text-xs text-muted">
                    Manage authentication credentials, cryptographic session keys, and active sessions.
                  </p>
                </div>

                {/* Current Authentication Method Card */}
                <div className="p-4 rounded-lg bg-surface-inset border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <KeyRound className="w-4 h-4 text-accent" />
                      <span className="font-semibold text-xs text-ink">Active Method: Cryptographic Password + Scrypt Salt</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-allow/10 text-allow border border-allow/30">
                      SECURE
                    </span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Passphrases are salted with 16-byte cryptographically secure random bytes and derived using the scrypt key-derivation function. Password hashes are verified in constant time.
                  </p>
                </div>

                {/* Change Password Form */}
                <form onSubmit={handleChangePassword} className="space-y-4 pt-2">
                  <h4 className="text-xs font-bold text-ink uppercase tracking-wider font-mono">Update Password</h4>

                  {passwordSuccess && (
                    <div className="p-3 rounded-lg bg-allow/10 border border-allow/30 text-allow text-xs flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{passwordSuccess}</span>
                    </div>
                  )}
                  {passwordError && (
                    <div className="p-3 rounded-lg bg-deny/10 border border-deny/30 text-deny text-xs flex items-center space-x-2">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>{passwordError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase font-mono mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3 py-2 rounded-md border border-border bg-surface-inset text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-muted uppercase font-mono mb-1">
                        New Password (Min 8 chars)
                      </label>
                      <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full px-3 py-2 rounded-md border border-border bg-surface-inset text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-muted uppercase font-mono mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full px-3 py-2 rounded-md border border-border bg-surface-inset text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={passwordSaving}
                    data-testid="change-password-btn"
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-md bg-primary hover:bg-primary-hover active:bg-primary-active text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                  >
                    {passwordSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{passwordSaving ? "Updating..." : "Update Password"}</span>
                  </button>
                </form>

                {/* Active Sessions List */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-ink uppercase tracking-wider font-mono">Active Sessions</h4>
                    <span className="text-[11px] text-muted">{sessions.length} authorized session(s)</span>
                  </div>

                  {sessionRevokeError && (
                    <div className="p-2.5 rounded-lg bg-deny/10 border border-deny/30 text-deny text-xs flex items-center space-x-2">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      <span>{sessionRevokeError}</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    {sessions.length === 0 ? (
                      <div className="p-4 rounded-lg bg-surface-inset border border-border text-center text-xs text-muted">
                        No active sessions found.
                      </div>
                    ) : (
                      sessions.map((s, idx) => (
                        <div
                          key={s.id || idx}
                          className="p-3 rounded-lg bg-surface-inset border border-border flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-2 h-2 rounded-full bg-allow" />
                            <div>
                              <span className="font-semibold text-ink font-mono text-[11px]">{s.id}</span>
                              <span className="text-[10px] text-muted block">
                                Created: {new Date(s.createdAt).toLocaleDateString()} · Expires: {new Date(s.expiresAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          {s.isCurrent ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-accent/15 text-accent font-semibold border border-accent/30">
                              Current Session
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRevokeSession(s.id)}
                              disabled={revokingSessionId === s.id}
                              data-testid={`revoke-session-btn-${s.id}`}
                              className="px-2.5 py-1 rounded text-[11px] font-mono font-medium border border-deny/30 text-deny hover:bg-deny/10 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {revokingSessionId === s.id ? "Revoking..." : "Revoke"}
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Enterprise Roadmap Disclosures */}
                <div className="p-4 rounded-lg bg-surface-subtle border border-dashed border-border space-y-2">
                  <div className="flex items-center space-x-2 text-muted">
                    <Shield className="w-4 h-4 text-accent" />
                    <span className="font-bold text-xs uppercase font-mono">Enterprise Authentication Roadmap</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    WebAuthn / FIDO2 Passkeys and SAML 2.0 / OIDC Enterprise Single Sign-on are scheduled for the subsequent enterprise release cycle. All current sessions use 256-bit SHA-256 token hashing.
                  </p>
                </div>
              </div>
            )}

            {/* 3. Organization & Workspace Tab */}
            {activeTab === "organization" && (
              <div className="space-y-6 max-w-2xl font-sans" data-testid="organization-section">
                <div>
                  <h3 className="text-base font-bold text-ink">Organization &amp; Workspace</h3>
                  <p className="text-xs text-muted">
                    Current organizational context, memberships, and multi-tenant isolation boundary.
                  </p>
                </div>

                {profile && profile.organizationId === null ? (
                  <div className="p-6 rounded-lg bg-surface-inset border border-border space-y-3 text-center" data-testid="no-organization-banner">
                    <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto text-accent">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-sm text-ink">No Organization Assigned</h4>
                      <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
                        This account is operating in standalone personal mode and does not currently belong to an enterprise organization workspace.
                      </p>
                    </div>
                    <div className="text-[11px] text-muted font-mono pt-1">
                      Multi-tenant boundary: ISOLATED_STANDALONE
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-4 rounded-lg bg-surface-inset border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-ink">{organization?.name || profile?.organizationName || "Warrant Enterprise HQ"}</h4>
                            <div className="flex items-center space-x-2 text-[10px] font-mono text-muted">
                              <span>Slug: {organization?.slug || (profile?.organizationId ? "warrant-hq" : "default-org")}</span>
                              <span>•</span>
                              <span>{organization?.members?.length ?? 1} personnel</span>
                            </div>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-accent/15 text-accent border border-accent/30">
                          Role: {organization?.membershipRole || profile?.organizationRole || "OWNER"}
                        </span>
                      </div>
                    </div>

                    {/* Workspace Members Header and Action */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Users className="w-4 h-4 text-accent" />
                          <h4 className="text-xs font-bold text-ink uppercase tracking-wider font-mono">Workspace Personnel</h4>
                        </div>
                        {(organization?.membershipRole === "OWNER" || organization?.membershipRole === "ADMIN" || profile?.organizationRole === "OWNER" || profile?.organizationRole === "ADMIN") && (
                          <button
                            type="button"
                            onClick={() => {
                              setInviteModalOpen((v) => !v);
                              setInviteError(null);
                              setInviteSuccess(null);
                            }}
                            className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-sans font-semibold bg-primary text-white hover:bg-primary-hover transition-colors shadow-2xs"
                            data-testid="invite-member-btn"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>{inviteModalOpen ? "Close Form" : "Add Colleague"}</span>
                          </button>
                        )}
                      </div>

                      {/* Inline Add Member Form */}
                      {inviteModalOpen && (
                        <form
                          onSubmit={handleInviteMember}
                          className="p-4 rounded-lg bg-surface-raised border border-accent/30 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150"
                          data-testid="invite-member-form"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-ink flex items-center space-x-1.5">
                                <UserPlus className="w-3.5 h-3.5 text-accent" />
                                <span>Add Colleague to Workspace</span>
                              </span>
                              <p className="text-[10px] text-muted mt-0.5">
                                Colleague must have an active VORENT account registered with this email.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setInviteModalOpen(false)}
                              className="text-muted hover:text-ink text-xs"
                            >
                              Cancel
                            </button>
                          </div>

                          {inviteError && (
                            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center space-x-2">
                              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                              <span>{inviteError}</span>
                            </div>
                          )}

                          {inviteSuccess && (
                            <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center space-x-2">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>{inviteSuccess}</span>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-ink mb-1">
                                Registered Email <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="email"
                                required
                                placeholder="colleague@company.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                data-testid="invite-email-input"
                                className="w-full h-8 px-2.5 rounded border border-border bg-surface text-ink text-xs focus:outline-hidden focus:ring-1 focus:ring-accent"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-ink mb-1">
                                Full Name <span className="text-muted">(Optional)</span>
                              </label>
                              <input
                                type="text"
                                placeholder="Alex Morgan"
                                value={inviteName}
                                onChange={(e) => setInviteName(e.target.value)}
                                data-testid="invite-name-input"
                                className="w-full h-8 px-2.5 rounded border border-border bg-surface text-ink text-xs focus:outline-hidden focus:ring-1 focus:ring-accent"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center space-x-2">
                              <label className="text-[11px] font-semibold text-ink">Role:</label>
                              <select
                                value={inviteRole}
                                onChange={(e) => setInviteRole(e.target.value as "ADMIN" | "MEMBER")}
                                className="h-7 px-2 rounded border border-border bg-surface text-ink text-xs focus:outline-hidden focus:ring-1 focus:ring-accent"
                              >
                                <option value="MEMBER">MEMBER (Standard Access)</option>
                                <option value="ADMIN">ADMIN (Approver / Policy Manager)</option>
                              </select>
                            </div>

                            <button
                              type="submit"
                              disabled={inviteSaving || !inviteEmail.trim()}
                              data-testid="invite-submit-btn"
                              className="px-4 py-1.5 rounded-md text-xs font-semibold bg-accent text-slate-950 hover:bg-accent/90 disabled:opacity-50 transition-colors shadow-2xs font-sans"
                            >
                              {inviteSaving ? "Adding..." : "Add Colleague"}
                            </button>
                          </div>
                        </form>
                      )}

                      {/* Dynamic Members List */}
                      <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-surface-inset" data-testid="workspace-members-list">
                        {organization?.members && organization.members.length > 0 ? (
                          organization.members.map((member) => {
                            const isSelf = member.userId === profile?.id || member.email.toLowerCase() === profile?.email.toLowerCase();
                            const initials = member.name
                              ? member.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                              : member.email.slice(0, 2).toUpperCase();

                            return (
                              <div key={member.id} className="p-3 flex items-center justify-between text-xs hover:bg-surface-raised/40 transition-colors">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center font-mono font-bold text-[11px] text-ink">
                                    {initials}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-ink flex items-center space-x-1.5">
                                      <span>{member.name || "Workspace Member"}</span>
                                      {isSelf && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                                          You
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-muted font-mono">{member.email}</div>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-3">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                      member.role === "OWNER"
                                        ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
                                        : member.role === "ADMIN"
                                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                        : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
                                    }`}
                                  >
                                    {member.role}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="p-6 text-center text-xs text-muted">
                            No workspace personnel records found.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 4. Roles & Permissions Tab */}
            {activeTab === "roles" && (
              <div className="space-y-6 max-w-2xl font-sans" data-testid="roles-section">
                <div>
                  <h3 className="text-base font-bold text-ink">Roles &amp; Authority Matrix</h3>
                  <p className="text-xs text-muted">
                    Authoritative server-enforced role-based access control (RBAC) boundaries.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-surface-inset border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">Your Assigned System Role:</span>
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-accent/15 text-accent border border-accent/30">
                      {profile?.role || user?.role || "REQUESTER"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Roles are cryptographically bound to session tokens and enforced server-side. Frontend role labels are non-authoritative and cannot grant or escalate privileges.
                  </p>
                </div>

                {/* Capability Table */}
                <div className="border border-border rounded-lg overflow-hidden bg-surface-inset">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-raised border-b border-border text-[10px] font-mono uppercase text-muted">
                      <tr>
                        <th className="p-2.5">Capability / Action</th>
                        <th className="p-2.5">Scope</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr>
                        <td className="p-2.5 font-medium text-ink">Compile NL Mandate to AST</td>
                        <td className="p-2.5 text-muted font-mono text-[11px]">/api/policies/compile</td>
                        <td className="p-2.5"><span className="text-allow font-semibold">AUTHORIZED</span></td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-medium text-ink">Run Bounded Permutation Search</td>
                        <td className="p-2.5 text-muted font-mono text-[11px]">/api/verification/runs</td>
                        <td className="p-2.5"><span className="text-allow font-semibold">AUTHORIZED</span></td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-medium text-ink">Create Cryptographic Approval</td>
                        <td className="p-2.5 text-muted font-mono text-[11px]">/api/approvals</td>
                        <td className="p-2.5">
                          {user?.role === "ADMINISTRATOR" || user?.role === "APPROVER" ? (
                            <span className="text-allow font-semibold">AUTHORIZED</span>
                          ) : (
                            <span className="text-deny font-semibold">RESTRICTED</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-medium text-ink">Issue Spend Nonce &amp; Lock Budget</td>
                        <td className="p-2.5 text-muted font-mono text-[11px]">/api/checkout/nonces</td>
                        <td className="p-2.5"><span className="text-allow font-semibold">AUTHORIZED</span></td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-medium text-ink">Capture PayPal Orders v2 Payment</td>
                        <td className="p-2.5 text-muted font-mono text-[11px]">/api/payment-orders/:id/capture</td>
                        <td className="p-2.5"><span className="text-allow font-semibold">AUTHORIZED</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. Preferences Tab */}
            {activeTab === "preferences" && (
              <form onSubmit={handleSavePreferences} className="space-y-6 max-w-2xl font-sans" data-testid="preferences-form">
                <div>
                  <h3 className="text-base font-bold text-ink">Interface &amp; Policy Preferences</h3>
                  <p className="text-xs text-muted">
                    Configure visual appearance, theme modes, and default verification contexts.
                  </p>
                </div>

                {prefsSuccess && (
                  <div className="p-3 rounded-lg bg-allow/10 border border-allow/30 text-allow text-xs flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{prefsSuccess}</span>
                  </div>
                )}

                {/* Theme Mode Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-ink font-sans">
                    Visual Design Theme
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedTheme("system")}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        selectedTheme === "system"
                          ? "border-accent bg-accent/10 ring-1 ring-accent"
                          : "border-border bg-surface-inset hover:bg-surface-raised"
                      }`}
                    >
                      <div className="font-semibold text-xs text-ink">System Auto</div>
                      <div className="text-[10px] text-muted mt-0.5">Follows OS setting</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTheme("light")}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        selectedTheme === "light"
                          ? "border-accent bg-accent/10 ring-1 ring-accent"
                          : "border-border bg-surface-inset hover:bg-surface-raised"
                      }`}
                    >
                      <div className="font-semibold text-xs text-ink">Warm Ivory</div>
                      <div className="text-[10px] text-muted mt-0.5">Ivory + Forest Green</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTheme("dark")}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        selectedTheme === "dark"
                          ? "border-accent bg-accent/10 ring-1 ring-accent"
                          : "border-border bg-surface-inset hover:bg-surface-raised"
                      }`}
                    >
                      <div className="font-semibold text-xs text-ink">Midnight Navy</div>
                      <div className="text-[10px] text-muted mt-0.5">Navy + Emerald</div>
                    </button>
                  </div>
                </div>

                {/* Default Policy Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-ink font-sans">
                    Default Verification Policy Context
                  </label>
                  <select
                    value={defaultPolicyId}
                    onChange={(e) => setDefaultPolicyId(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-border bg-surface-inset text-ink text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="pol_v1_books_hardware">Engineering Equipment &amp; Books (pol_v1_books_hardware)</option>
                    <option value="pol_seeded_defect_unbounded_cart">Defect Permutation Unbounded Cart (pol_seeded_defect_unbounded_cart)</option>
                  </select>
                </div>

                {/* Email Notifications Toggle */}
                <div className="p-3.5 rounded-lg bg-surface-inset border border-border flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-xs text-ink">Email Notifications for Critical Findings</div>
                    <div className="text-[11px] text-muted">
                      Receive immediate dispatches when a bounded search discovers counterexamples.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <div>
                    {preferences && (
                      <span className="text-[10px] text-muted font-mono">
                        Active Theme: {preferences.theme} · Notifications: {preferences.emailNotifications ? "ON" : "OFF"}
                      </span>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={prefsSaving}
                    data-testid="save-preferences-btn"
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-md bg-primary hover:bg-primary-hover active:bg-primary-active text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                  >
                    {prefsSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{prefsSaving ? "Saving..." : "Save Preferences"}</span>
                  </button>
                </div>
              </form>
            )}

            {/* 6. Connected Services Tab */}
            {activeTab === "integrations" && (
              <div className="space-y-6 max-w-2xl font-sans" data-testid="integrations-section">
                <div>
                  <h3 className="text-base font-bold text-ink">Connected Services &amp; Integrations</h3>
                  <p className="text-xs text-muted">
                    Authoritative telemetry for PayPal Sandbox settlement, Gemini LLM, and database engines.
                  </p>
                </div>

                {/* PayPal Sandbox */}
                <div className="p-4 rounded-lg bg-surface-inset border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                      <span className="font-bold text-xs text-ink">PayPal Orders v2 API</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      {integrations?.paypal?.environment || "SANDBOX"} MODE ({integrations?.paypal?.status || "CONNECTED"})
                    </span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Orders are processed via server-to-server OAuth credentials in PayPal Sandbox. Live captures require explicit buyer authorization; no real financial charges occur.
                  </p>
                  <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px] font-mono text-muted">
                    <span>Provider ID: PAYPAL_SANDBOX</span>
                    <span>Webhook Configured: {integrations?.paypal?.webhookConfigured ? "YES" : "NO"}</span>
                  </div>
                </div>

                {/* Gemini AI */}
                <div className="p-4 rounded-lg bg-surface-inset border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <Cpu className="w-4 h-4 text-accent" />
                      <span className="font-bold text-xs text-ink">Google Gemini LLM Engine</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-allow/10 text-allow border border-allow/30">
                      {integrations?.gemini?.status || "CONNECTED"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Natural-language mandates are compiled using Gemini 2.0 Flash into formal AST rules and canonical RFC 8785 JSON with SHA-256 digests.
                  </p>
                  <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px] font-mono text-muted">
                    <span>Model: {integrations?.gemini?.model || "gemini-2.0-flash"}</span>
                    <span>Mandate Compiler: {integrations?.gemini?.mandateCompilationAvailable ? "ACTIVE" : "STANDBY"}</span>
                  </div>
                </div>

                {/* PostgreSQL Database */}
                <div className="p-4 rounded-lg bg-surface-inset border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <Database className="w-4 h-4 text-accent" />
                      <span className="font-bold text-xs text-ink">PostgreSQL Database Engine</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-allow/10 text-allow border border-allow/30">
                      {integrations?.database?.connected ? "CONNECTED" : "FALLBACK"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Persistent store for immutable policies, bounded test runs, audit trails, and spend reservations.
                  </p>
                  <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px] font-mono text-muted">
                    <span>Status: {integrations?.database?.connected ? "Connected" : "In-Memory Dual Mode"}</span>
                    <span>Engine RLS: Disabled (App Layer Enforced)</span>
                  </div>
                </div>
              </div>
            )}

            {/* 7. Account Activity Tab */}
            {activeTab === "activity" && (
              <div className="space-y-4 max-w-2xl font-sans" data-testid="activity-section">
                <div>
                  <h3 className="text-base font-bold text-ink">Security &amp; Governance Activity</h3>
                  <p className="text-xs text-muted">
                    Immutable audit log of recent authentications, policy adjustments, and governance actions.
                  </p>
                </div>

                <div className="border border-border rounded-lg overflow-hidden bg-surface-inset">
                  <div className="divide-y divide-border">
                    {activity.length > 0 ? (
                      activity.map((act) => (
                        <div key={act.id} className="p-3 text-xs flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="font-semibold text-ink font-mono text-[11px]">{act.eventType}</span>
                            <span className="text-[10px] text-muted block">
                              Entity: {act.entityType} · Actor: {act.actorType}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-muted">
                            {new Date(act.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-xs text-muted">
                        No activity records found.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 8. Help & Legal Tab */}
            {activeTab === "help" && (
              <div className="space-y-6 max-w-2xl font-sans" data-testid="help-section">
                <div>
                  <h3 className="text-base font-bold text-ink">Documentation, Privacy &amp; Terms</h3>
                  <p className="text-xs text-muted">
                    System specifications, privacy policies, terms of service, and compliance disclosures.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-surface-inset border border-border space-y-2">
                  <h4 className="font-bold text-xs text-ink uppercase tracking-wider font-mono">Privacy Policy</h4>
                  <p className="text-[11px] text-muted leading-relaxed">
                    VORENT operates on a strict zero-credential-exposure model. Autonomous shopping agents never handle raw payment credentials or authorization tokens directly. All sensitive data is hashed or tokenized.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-surface-inset border border-border space-y-2">
                  <h4 className="font-bold text-xs text-ink uppercase tracking-wider font-mono">Terms of Service</h4>
                  <p className="text-[11px] text-muted leading-relaxed">
                    By operating VORENT, users agree to abide by architectural decision D-014: risk acceptance is strictly prohibited for critical findings, and policies failing bounded verification will not issue checkout approvals.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-surface-inset border border-border space-y-2">
                  <h4 className="font-bold text-xs text-ink uppercase tracking-wider font-mono">Documentation &amp; Support</h4>
                  <p className="text-[11px] text-muted leading-relaxed">
                    For enterprise integrations, visit the official VORENT documentation repository or review <code className="text-xs font-mono bg-surface p-1 rounded">README.md</code> and <code className="text-xs font-mono bg-surface p-1 rounded">DEMO_SCRIPT.md</code>.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
