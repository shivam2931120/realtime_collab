import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { isMissingTableError } from "../utils/dbErrors";

const authDisabled = process.env.DISABLE_AUTH === "true";

const shapeNotification = (notification: any, actorEmail: string, documentTitle: string) => ({
  id: notification.id,
  type: notification.type,
  title: notification.type === "document_shared" ? "Document shared" : "Notification",
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

    const { data: notifications } = await supabase
      .from("notifications")
      .select("*, documents(title)")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(25);

    const { count: unreadCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .eq("read", false);

    if (!notifications || notifications.length === 0) {
      return res.json({ notifications: [], unreadCount: 0 });
    }

    const uniqueSenderIds = [...new Set(notifications.map(n => n.sender_id).filter(Boolean))];
    const userMap = new Map();

    if (!authDisabled && uniqueSenderIds.length > 0) {
      try {
        const usersResp = await clerkClient.users.getUserList({ userId: uniqueSenderIds });
        const userList: any[] = Array.isArray(usersResp) ? usersResp : (usersResp as any).data || [];
        userList.forEach((u: any) => {
          userMap.set(u.id, u.emailAddresses[0]?.emailAddress || "");
        });
      } catch (err) {
        console.error("Clerk fetch users error in notifications", err);
      }
    }

    const shaped = notifications.map(n => 
      shapeNotification(n, userMap.get(n.sender_id) || "unknown", n.documents?.title || "")
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

    let actorEmail = "";
    if (!authDisabled && notification.sender_id) {
      try {
        const u = await clerkClient.users.getUser(notification.sender_id);
        actorEmail = u.emailAddresses[0]?.emailAddress || "";
      } catch (e) {}
    }

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
