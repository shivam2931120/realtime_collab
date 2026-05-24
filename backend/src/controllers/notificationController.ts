import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { isMissingTableError } from "../utils/dbErrors";
import { emailFromUserId } from "../utils/userIdentity";

const shapeNotification = (notification: any, actorEmail: string, documentTitle: string) => ({
  id: notification.id,
  type: notification.type,
  title:
    notification.type === "document_shared"
      ? "Document shared"
      : notification.type === "comment_mention"
        ? "Mentioned in comment"
        : "Notification",
  message: notification.message,
  isRead: notification.read,
  createdAt: notification.created_at,
  actor: {
    id: notification.sender_id || "",
    email: actorEmail,
  },
  document: {
    id: notification.document_id || "",
    title: documentTitle || "",
  },
});

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const requestedLimit = Number(req.query.limit || 25);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 25;
    const unreadOnly = String(req.query.unreadOnly || "false") === "true";

    let notificationsQuery = supabase
      .from("notifications")
      .select("*, documents(title)")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      notificationsQuery = notificationsQuery.eq("read", false);
    }

    const { data: notifications } = await notificationsQuery;

    const { count: unreadCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .eq("read", false);

    if (!notifications || notifications.length === 0) {
      return res.json({ notifications: [], unreadCount: 0 });
    }

    const shaped = notifications.map(n => 
      shapeNotification(n, emailFromUserId(n.sender_id), n.documents?.title || "")
    );

    return res.json({
      notifications: shaped,
      unreadCount: unreadCount || 0,
    });
  } catch (error) {
    console.error("Fetch notifications failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using notifications.",
      });
    }
    return res.status(500).json({ message: "Notifications load nahi hui" });
  }
};

export const markNotificationRead = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    const { data: notification } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", req.params.id)
      .eq("recipient_id", userId)
      .select("*, documents(title)")
      .single();

    if (!notification) {
      return res.status(404).json({ message: "Notification nahi mili" });
    }

    const actorEmail = notification.sender_id ? emailFromUserId(notification.sender_id) : "";

    return res.json({ 
      notification: shapeNotification(notification, actorEmail, notification.documents?.title || "") 
    });
  } catch (error) {
    console.error("Mark notification failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using notifications.",
      });
    }
    return res.status(500).json({ message: "Notification update nahi hui" });
  }
};

export const markAllNotificationsRead = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });
    const userId = auth.userId;

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("recipient_id", userId)
      .eq("read", false);

    return res.json({ success: true });
  } catch (error) {
    console.error("Mark all notifications failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using notifications.",
      });
    }
    return res.status(500).json({ message: "Notifications update nahi hui" });
  }
};

export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) return res.status(401).json({ message: "Unauthorized" });

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", req.params.id)
      .eq("recipient_id", auth.userId);

    if (error) throw error;

    return res.json({ success: true, id: req.params.id });
  } catch (error) {
    console.error("Delete notification failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using notifications.",
      });
    }
    return res.status(500).json({ message: "Notification delete nahi hui" });
  }
};
