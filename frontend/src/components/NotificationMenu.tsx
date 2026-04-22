import { useEffect, useMemo, useState } from "react";
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
  const [open, setOpen] = useState(false);

  const loadNotifications = async () => {
    const response = await api.get<{ notifications: AppNotification[]; unreadCount: number }>(
      "/notifications",
    );
    setNotifications(response.data.notifications, response.data.unreadCount);
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

  const latestNotifications = useMemo(() => notifications.slice(0, 8), [notifications]);

  const handleMarkRead = async (id: string) => {
    await api.put(`/notifications/${id}/read`);
    markNotificationRead(id);
  };

  const handleMarkAllRead = async () => {
    await api.put("/notifications/read-all");
    markAllReadStore();
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
        <div className="absolute right-0 top-12 z-[80] w-[360px] rounded-lg border border-white/10 bg-surface-container p-4 shadow-2xl">
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

          <div className="space-y-3">
            {latestNotifications.length ? (
              latestNotifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleMarkRead(notification.id).catch(console.error)}
                  className={`w-full rounded border p-3 text-left transition hover:border-primary/40 ${
                    notification.isRead
                      ? "border-white/5 bg-surface"
                      : "border-primary/30 bg-primary/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{notification.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                        {notification.message}
                      </p>
                    </div>
                    {!notification.isRead ? (
                      <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-on-surface-variant">
                    <span>{new Date(notification.createdAt).toLocaleString()}</span>
                    <Link
                      to={`/editor/${notification.document.id}`}
                      className="text-primary"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Open
                    </Link>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded border border-white/5 bg-surface p-4 text-sm text-on-surface-variant">
                No notifications yet.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default NotificationMenu;
