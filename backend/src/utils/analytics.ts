import { supabase } from "../config/supabase";

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
  | "document_invite_cancelled";

export const trackDocumentEvent = async (payload: {
  documentId: string;
  actorId: string;
  eventType: DocumentEventType;
  metadata?: Record<string, unknown>;
}) => {
  try {
    await supabase.from("document_events").insert({
      document_id: payload.documentId,
      actor_id: payload.actorId,
      event_type: payload.eventType,
      metadata: payload.metadata || {},
    });
  } catch (error) {
    // Do not fail the main request when analytics logging fails.
    console.error("Track document event failed", error);
  }
};
