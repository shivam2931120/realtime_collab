import { create } from "zustand";
import { SessionUser, clearSession, clerkEnabled, getStoredSession, saveSession } from "../services/auth";

type AuthState = {
  token: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
  hydrated: boolean;
  hydrate: () => void;
  setSession: (token: string, user: SessionUser, refreshToken?: string) => void;
  setClerkSession: (user: SessionUser | null) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  refreshToken: null,
  user: null,
  hydrated: false,
  hydrate: () => {
    if (clerkEnabled) {
      clearSession();
      set({ hydrated: true });
      return;
    }
    const session = getStoredSession();
    set({
      token: session?.token || null,
      refreshToken: session?.refreshToken || null,
      user: session?.user || null,
      hydrated: true,
    });
  },
  setSession: (token, user, refreshToken) => {
    saveSession({ token, refreshToken, user });
    set({ token, refreshToken: refreshToken || null, user, hydrated: true });
  },
  setClerkSession: (user) => set({ token: user ? "clerk-session" : null, refreshToken: null, user, hydrated: true }),
  clearSession: () => {
    clearSession();
    set({ token: null, refreshToken: null, user: null, hydrated: true });
  },
}));
