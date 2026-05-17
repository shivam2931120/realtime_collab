import { create } from "zustand";

type DocumentPreference = {
  starred?: boolean;
  pinned?: boolean;
};

export type ProfilePreferences = {
  displayName: string;
  avatarColor: string;
  emailNotifications: boolean;
};

type PreferencesState = {
  documentPreferences: Record<string, DocumentPreference>;
  profile: ProfilePreferences;
  toggleStarred: (documentId: string) => void;
  togglePinned: (documentId: string) => void;
  updateProfile: (profile: ProfilePreferences) => void;
};

const STORAGE_KEY = "editorial.preferences.v1";

const defaultProfile: ProfilePreferences = {
  displayName: "",
  avatarColor: "#10b981",
  emailNotifications: true,
};

const hasStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

const loadPreferences = () => {
  try {
    if (!hasStorage()) {
      return { documentPreferences: {}, profile: defaultProfile };
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { documentPreferences: {}, profile: defaultProfile };
    }

    const parsed = JSON.parse(raw);
    return {
      documentPreferences: parsed.documentPreferences || {},
      profile: { ...defaultProfile, ...(parsed.profile || {}) },
    };
  } catch {
    return { documentPreferences: {}, profile: defaultProfile };
  }
};

const persistPreferences = (state: Pick<PreferencesState, "documentPreferences" | "profile">) => {
  if (!hasStorage()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      documentPreferences: state.documentPreferences,
      profile: state.profile,
    }),
  );
};

const initialPreferences = loadPreferences();

export const usePreferencesStore = create<PreferencesState>((set) => ({
  documentPreferences: initialPreferences.documentPreferences,
  profile: initialPreferences.profile,
  toggleStarred: (documentId) =>
    set((state) => {
      const current = state.documentPreferences[documentId] || {};
      const next = {
        ...state,
        documentPreferences: {
          ...state.documentPreferences,
          [documentId]: { ...current, starred: !current.starred },
        },
      };
      persistPreferences(next);
      return next;
    }),
  togglePinned: (documentId) =>
    set((state) => {
      const current = state.documentPreferences[documentId] || {};
      const next = {
        ...state,
        documentPreferences: {
          ...state.documentPreferences,
          [documentId]: { ...current, pinned: !current.pinned },
        },
      };
      persistPreferences(next);
      return next;
    }),
  updateProfile: (profile) =>
    set((state) => {
      const next = { ...state, profile };
      persistPreferences(next);
      return next;
    }),
}));
