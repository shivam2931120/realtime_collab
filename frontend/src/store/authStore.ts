import { create } from "zustand";
import { SessionUser, clearSession, getStoredSession, saveSession } from "../services/auth";

type AuthState = {
  token: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
  hydrated: boolean;
  hydrate: () => void;
  setSession: (token: string, user: SessionUser, refreshToken?: string) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  refreshToken: null,
  user: null,
  hydrated: false,
  hydrate: () => {
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
  clearSession: () => {
    clearSession();
    set({ token: null, refreshToken: null, user: null, hydrated: true });
  },
}));
