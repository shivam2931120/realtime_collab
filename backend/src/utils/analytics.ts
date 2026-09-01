import { supabase } from "../config/supabase";
import { dispatchDocumentEvent } from "./outboundIntegrations";
import { emailFromUserId } from "./userIdentity";

export type DocumentEventType =
  | "document_created"
  | "document_viewed"
  | "document_updated"
  | "document_shared"
  | "document_commented"
  | "document_exported"
  | "document_imported"
  | "document_deleted"
  | "document_restored"
  | "document_ownership_transferred"
  | "document_bulk_action"
  | "document_invite_cancelled"
  | "document_public_link_created"
  | "document_public_link_revoked"
  | "document_attachment_uploaded"
  | "document_attachment_deleted"
  | "document_deadline_created"
  | "document_deadline_updated"
  | "document_suggestion_created"
  | "document_suggestion_decided";

export const trackDocumentEvent = async (payload: {
  documentId: string;
  actorId: string;
  eventType: DocumentEventType;
  metadata?: Record<string, unknown>;
}) => {
  try {
    const { data: event } = await supabase.from("document_events").insert({
      document_id: payload.documentId,
      actor_id: payload.actorId,
      event_type: payload.eventType,
      metadata: payload.metadata || {},
    }).select("id, created_at").single();
    if (event) {
      const { data: document } = await supabase.from("documents").select("owner_id, title").eq("id", payload.documentId).single();
      if (document) void dispatchDocumentEvent({ id: event.id, type: payload.eventType, documentId: payload.documentId, documentTitle: document.title, actorId: payload.actorId, actorEmail: emailFromUserId(payload.actorId), metadata: payload.metadata || {}, createdAt: event.created_at }, document.owner_id).catch((error) => console.error("Outbound event dispatch failed", error));
    }
  } catch (error) {
    // Do not fail the main request when analytics logging fails.
    console.error("Track document event failed", error);
  }
};
