import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useUiStore } from "../store/uiStore";
import { AppNotification } from "../types";

const NotificationMenu = () => {
  const notifications = useUiStore((state) => state.notifications);
  const unreadCount = useUiStore((state) => state.unreadCount);
  const setNotifications = useUiStore((state) => state.setNotifications);
  const markNotificationRead = useUiStore((state) => state.markNotificationRead);
  const markAllReadStore = useUiStore((state) => state.markAllRead);
  const removeNotification = useUiStore((state) => state.removeNotification);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [toast, setToast] = useState<AppNotification | null>(null);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const loadNotifications = async (options: { announce?: boolean } = {}) => {
    const response = await api.get<{ notifications: AppNotification[]; unreadCount: number }>(
      "/notifications",
      { params: { limit: 50 } },
    );
    const nextNotifications = response.data.notifications || [];
    const previousIds = seenNotificationIdsRef.current;
    const nextIds = new Set(nextNotifications.map((notification) => notification.id));
    const freshUnread = nextNotifications.find(
      (notification) => !notification.isRead && !previousIds.has(notification.id),
    );

    setNotifications(nextNotifications, response.data.unreadCount);
    seenNotificationIdsRef.current = nextIds;

    if (initializedRef.current && options.announce && freshUnread) {
      setToast(freshUnread);
    }
    initializedRef.current = true;
  };

  useEffect(() => {
    loadNotifications().catch(console.error);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    loadNotifications().catch(console.error);
  }, [open]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadNotifications({ announce: true }).catch(console.error);
    }, 30000);
    const handleFocus = () => {
      loadNotifications({ announce: true }).catch(console.error);
    };
    const handleVisibility = () => {
      if (!document.hidden) {
        loadNotifications({ announce: true }).catch(console.error);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const latestNotifications = useMemo(
    () => notifications.filter((notification) => filter === "all" || !notification.isRead).slice(0, 12),
    [filter, notifications],
  );

  const handleMarkRead = async (id: string) => {
    await api.put(`/notifications/${id}/read`);
    markNotificationRead(id);
  };

  const handleMarkAllRead = async () => {
    await api.put("/notifications/read-all");
    markAllReadStore();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/notifications/${id}`);
    removeNotification(id);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative rounded p-2 text-[#a3a3a3] transition-colors duration-200 hover:bg-[#201f1f] active:scale-90"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-on-primary">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-[80] w-[min(360px,calc(100vw-1rem))] rounded-lg border border-white/10 bg-surface-container p-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                Notifications
              </p>
              <p className="mt-1 text-sm text-white">{unreadCount} unread</p>
            </div>
            <button
              type="button"
              onClick={() => handleMarkAllRead().catch(console.error)}
              className="text-[10px] font-bold uppercase tracking-widest text-primary"
            >
              Mark all read
            </button>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-1 rounded border border-white/5 bg-surface-container-low p-1">
            {(["all", "unread"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-widest transition ${
                  filter === item ? "bg-primary/20 text-primary" : "text-on-surface-variant hover:text-white"
                }`}
              >
                {item === "all" ? "All" : `Unread ${unreadCount}`}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {latestNotifications.length ? (
              latestNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`w-full rounded border p-3 text-left transition hover:border-primary/40 ${
                    notification.isRead
                      ? "border-white/5 bg-surface"
                      : "border-primary/30 bg-primary/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handleMarkRead(notification.id).catch(console.error)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-semibold text-white">{notification.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                        {notification.message}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      {!notification.isRead ? (
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleDelete(notification.id).catch(console.error)}
                        className="rounded p-1 text-on-surface-variant transition hover:bg-error-container/20 hover:text-error"
                        title="Delete notification"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-on-surface-variant">
                    <span>{new Date(notification.createdAt).toLocaleString()}</span>
                    <Link
                      to={`/editor/${notification.document.id}`}
                      className="text-primary"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpen(false);
                        if (!notification.isRead) {
                          handleMarkRead(notification.id).catch(console.error);
                        }
                      }}
                    >
                      Open
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded border border-white/5 bg-surface p-4 text-sm text-on-surface-variant">
                No notifications yet.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {toast ? (
        <button
          type="button"
          onClick={() => {
            setToast(null);
            setOpen(true);
          }}
          className="editorial-panel fixed right-4 top-16 z-[110] max-w-[min(360px,calc(100vw-2rem))] rounded-lg border border-primary/30 p-4 text-left shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-primary">notifications</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{toast.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">{toast.message}</p>
            </div>
          </div>
        </button>
      ) : null}
    </div>
  );
};

export default NotificationMenu;
