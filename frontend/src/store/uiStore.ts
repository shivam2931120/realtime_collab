import { create } from "zustand";
import { AppNotification } from "../types";

type UiState = {
  searchTerm: string;
  notifications: AppNotification[];
  unreadCount: number;
  setSearchTerm: (value: string) => void;
  setNotifications: (notifications: AppNotification[], unreadCount: number) => void;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  searchTerm: "",
  notifications: [],
  unreadCount: 0,
  setSearchTerm: (value) => set({ searchTerm: value }),
  setNotifications: (notifications, unreadCount) => set({ notifications, unreadCount }),
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
}));
