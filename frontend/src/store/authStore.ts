import { create } from "zustand";
import { SessionUser, clearSession, getStoredSession, saveSession } from "../services/auth";

type AuthState = {
  token: string | null;
  user: SessionUser | null;
  hydrated: boolean;
  hydrate: () => void;
  setSession: (token: string, user: SessionUser) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,
  hydrate: () => {
    const session = getStoredSession();
    set({
      token: session?.token || null,
      user: session?.user || null,
      hydrated: true,
    });
  },
  setSession: (token, user) => {
    saveSession({ token, user });
    set({ token, user, hydrated: true });
  },
  clearSession: () => {
    clearSession();
    set({ token: null, user: null, hydrated: true });
  },
}));
