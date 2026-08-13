import { create } from "zustand";
import { AppNotification } from "../types";

type UiState = {
  searchTerm: string;
  notifications: AppNotification[];
  unreadCount: number;
  backendError: {
    status: number | null;
    message: string;
    path?: string;
  } | null;
  setSearchTerm: (value: string) => void;
  setNotifications: (notifications: AppNotification[], unreadCount: number) => void;
  setBackendError: (error: NonNullable<UiState["backendError"]>) => void;
  clearBackendError: () => void;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
};

export const useUiStore = create<UiState>((set) => ({
  searchTerm: "",
  notifications: [],
  unreadCount: 0,
  backendError: null,
  setSearchTerm: (value) => set({ searchTerm: value }),
  setNotifications: (notifications, unreadCount) => set({ notifications, unreadCount }),
  setBackendError: (backendError) => set({ backendError }),
  clearBackendError: () => set({ backendError: null }),
  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((item) =>
        item.id === id ? { ...item, isRead: true } : item,
      ),
      unreadCount: Math.max(
        0,
        state.notifications.some((item) => item.id === id && !item.isRead)
          ? state.unreadCount - 1
          : state.unreadCount,
      ),
    })),
  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((item) => ({ ...item, isRead: true })),
      unreadCount: 0,
    })),
  removeNotification: (id) =>
    set((state) => {
      const removed = state.notifications.find((item) => item.id === id);
      return {
        notifications: state.notifications.filter((item) => item.id !== id),
        unreadCount: Math.max(0, state.unreadCount - (removed && !removed.isRead ? 1 : 0)),
      };
    }),
}));
