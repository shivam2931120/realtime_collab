import { supabase } from "../config/supabase";

const AUTO_SNAPSHOT_INTERVAL_MS = 30_000;
const lastAutoSnapshotByDocument = new Map<string, number>();

export const maybeCreateAutomaticVersion = async ({
  documentId,
  content,
  userId,
}: {
  documentId: string;
  content: string;
  userId: string;
}) => {
  const now = Date.now();
  const lastSnapshot = lastAutoSnapshotByDocument.get(documentId) || 0;

  if (now - lastSnapshot < AUTO_SNAPSHOT_INTERVAL_MS) {
    return;
  }

  lastAutoSnapshotByDocument.set(documentId, now);

  await supabase.from("document_versions").insert({
    document_id: documentId,
    content,
    created_by: userId,
  });
};

export const restoreDocumentVersion = async ({
  documentId,
  versionId,
  userId,
}: {
  documentId: string;
  versionId: string;
  userId: string;
}) => {
  const { data: version, error: versionError } = await supabase
    .from("document_versions")
    .select("id,document_id,content")
    .eq("id", versionId)
    .eq("document_id", documentId)
    .single();

  if (versionError || !version) {
    return { restored: null as null | { content: string }, error: versionError || new Error("Version not found") };
  }

  const { data: currentDocument } = await supabase
    .from("documents")
    .select("content")
    .eq("id", documentId)
    .single();

  const updatedAt = new Date().toISOString();
  const { data: document, error: updateError } = await supabase
    .from("documents")
    .update({ content: version.content, updated_at: updatedAt })
    .eq("id", documentId)
    .select("*")
    .single();

  if (updateError || !document) {
    return { restored: null as null | { content: string }, error: updateError || new Error("Restore failed") };
  }

  await supabase.from("document_versions").insert({
    document_id: documentId,
    content: currentDocument?.content || "",
    created_by: userId,
  });

  return { restored: { content: version.content }, error: null };
};
