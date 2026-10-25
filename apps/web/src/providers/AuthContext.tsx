import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { AuthUser } from "@warrant/contracts";
import { authService, type PersonaInfo } from "../api/authService";


export interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  personas: PersonaInfo[];
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  switchPersona: (email: string, password?: string) => Promise<void>;
  isAuthModalOpen: boolean;
  authModalTab: "login" | "register";
  openAuthModal: (tab?: "login" | "register") => void;
  closeAuthModal: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(authService.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [personas, setPersonas] = useState<PersonaInfo[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<"login" | "register">("login");

  // Fetch current user if token exists and load personas
  const initAuth = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Load starter personas
      try {
        const personasRes = await authService.getPersonas();
        if (personasRes && Array.isArray(personasRes.personas)) {
          setPersonas(personasRes.personas);
        }
      } catch {
        // Non-blocking if API offline
      }

      // 2. Hydrate session if token exists
      const currentToken = authService.getToken();
      if (currentToken) {
        try {
          const meRes = await authService.getMe();
          if (meRes?.user) {
            setUser(meRes.user);
            setToken(currentToken);
            setIsLoading(false);
            return;
          }
        } catch {
          // Token invalid or expired - clear local state
          await authService.logout();
          setUser(null);
          setToken(null);
        }
      }

      // 3. Fallback to default persona (Admin or Requester) for seamless interactive experience
      // if no explicit token is yet stored
      try {
        const loginRes = await authService.login({
          email: "admin@warrant.studio",
          password: "AdminPass123!",
        });
        if (loginRes?.user && loginRes?.token) {
          setUser(loginRes.user);
          setToken(loginRes.token);
        }
      } catch {
        // Standby offline mode
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      const res = await authService.login({ email, password });
      setUser(res.user);
      setToken(res.token);
      setIsAuthModalOpen(false);
    } catch (err: any) {
      const msg = err?.data?.error?.message || err?.message || "Failed to log in";
      setError(msg);
      throw err;
    }
  };

  const register = async (email: string, password: string, name?: string) => {
    setError(null);
    try {
      const res = await authService.register({ email, password, name });
      setUser(res.user);
      setToken(res.token);
      setIsAuthModalOpen(false);
    } catch (err: any) {
      const msg = err?.data?.error?.message || err?.message || "Failed to register";
      setError(msg);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setToken(null);
    }
  };

  const switchPersona = async (email: string, plainPassword?: string) => {
    setError(null);
    // Find persona password if not provided
    const targetPersona = personas.find((p) => p.email.toLowerCase() === email.toLowerCase());
    const pass = plainPassword || targetPersona?.passwordHint || "AdminPass123!";
    try {
      const res = await authService.login({ email, password: pass });
      setUser(res.user);
      setToken(res.token);
    } catch (err: any) {
      const msg = err?.data?.error?.message || err?.message || "Failed to switch persona";
      setError(msg);
      throw err;
    }
  };

  const openAuthModal = (tab: "login" | "register" = "login") => {
    setAuthModalTab(tab);
    setError(null);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
    setError(null);
  };

  const clearError = () => setError(null);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isLoading,
    error,
    personas,
    login,
    register,
    logout,
    switchPersona,
    isAuthModalOpen,
    authModalTab,
    openAuthModal,
    closeAuthModal,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
