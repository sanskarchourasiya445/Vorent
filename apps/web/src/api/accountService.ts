import {
  type UserProfile,
  type UpdateProfileRequest,
  type UserPreferences,
  type UpdatePreferencesRequest,
  type ChangePasswordRequest,
  type AccountActivityItem,
  type ConnectedServicesResponse,
  type OrganizationDetails,
  type OrganizationMember,
  type InviteMemberRequest,
} from "@warrant/contracts";
import { request } from "./client";

export const accountService = {
  /**
   * Fetch current user profile with role and organization context.
   */
  async getProfile(): Promise<UserProfile> {
    const data = await request<{ profile: UserProfile }>("/api/account/profile");
    return data.profile;
  },

  /**
   * Update profile fields (name, jobTitle, department, phoneNumber, bio, avatarUrl).
   */
  async updateProfile(updates: UpdateProfileRequest): Promise<UserProfile> {
    const data = await request<{ profile: UserProfile }>("/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    return data.profile;
  },

  /**
   * Fetch user preferences.
   */
  async getPreferences(): Promise<UserPreferences> {
    const data = await request<{ preferences: UserPreferences }>("/api/account/preferences");
    return data.preferences;
  },

  /**
   * Update user preferences.
   */
  async updatePreferences(updates: UpdatePreferencesRequest): Promise<UserPreferences> {
    const data = await request<{ preferences: UserPreferences }>("/api/account/preferences", {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    return data.preferences;
  },

  /**
   * Change password.
   */
  async changePassword(input: ChangePasswordRequest): Promise<void> {
    await request<{ success: boolean }>("/api/account/change-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /**
   * Fetch security & governance activity log.
   */
  async getActivity(): Promise<AccountActivityItem[]> {
    const data = await request<{ activity: AccountActivityItem[] }>("/api/account/activity");
    return data.activity;
  },

  /**
   * Fetch active sessions.
   */
  async getSessions(): Promise<Array<{ id: string; createdAt: string; expiresAt: string; isCurrent: boolean }>> {
    const data = await request<{ sessions: Array<{ id: string; createdAt: string; expiresAt: string; isCurrent: boolean }> }>("/api/account/sessions");
    return data.sessions;
  },

  /**
   * Revoke an active session by ID.
   */
  async revokeSession(sessionId: string): Promise<{ success: boolean; isCurrent: boolean }> {
    const data = await request<{ success: boolean; isCurrent: boolean }>(`/api/account/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });
    return data;
  },

  /**
   * Fetch connected services & environment status.
   */
  async getConnectedServices(): Promise<ConnectedServicesResponse> {
    const data = await request<{ integrations: ConnectedServicesResponse }>("/api/account/integrations");
    return data.integrations;
  },

  /**
   * Fetch current user's organization details and members.
   * Returns null if the user does not belong to any organization.
   */
  async getOrganization(): Promise<OrganizationDetails | null> {
    const data = await request<{ organization: OrganizationDetails | null }>("/api/account/organization");
    return data.organization;
  },

  /**
   * Add a colleague to the workspace by registered email.
   */
  async addMember(input: InviteMemberRequest): Promise<OrganizationMember> {
    const data = await request<{ member: OrganizationMember }>("/api/account/organization/members", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return data.member;
  },

  /**
   * Alias for backwards compatibility.
   */
  async inviteMember(input: InviteMemberRequest): Promise<OrganizationMember> {
    return this.addMember(input);
  },
};
