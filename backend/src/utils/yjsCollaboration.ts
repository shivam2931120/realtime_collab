import { supabase } from "../config/supabase";

const loadYjs = () => import("yjs");

type CachedDocument = {
  doc: any;
  persistTimer?: NodeJS.Timeout;
};

const documents = new Map<string, Promise<CachedDocument>>();

const decodeUpdate = (value?: string | null) =>
  value ? Uint8Array.from(Buffer.from(value, "base64")) : null;

export const encodeUpdate = (update: Uint8Array) => Buffer.from(update).toString("base64");

const persistDocument = async (documentId: string, doc: any) => {
  const Y = await loadYjs();
  const stateBase64 = encodeUpdate(Y.encodeStateAsUpdate(doc));
  const { error } = await supabase.from("document_collaboration_states").upsert({
    document_id: documentId,
    state_base64: stateBase64,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
};

export const getCollaborationDocument = async (documentId: string) => {
  let pending = documents.get(documentId);
  if (!pending) {
    pending = (async () => {
      const Y = await loadYjs();
      const doc = new Y.Doc();
      const { data, error } = await supabase
        .from("document_collaboration_states")
        .select("state_base64")
        .eq("document_id", documentId)
        .maybeSingle();

      // The feature remains compatible with databases awaiting the additive migration.
      if (error && !String(error.message || "").toLowerCase().includes("document_collaboration_states")) {
        throw error;
      }

      const stored = decodeUpdate(data?.state_base64);
      if (stored?.length) Y.applyUpdate(doc, stored, "database");

      const cached: CachedDocument = { doc };
      doc.on("update", (_update: Uint8Array, origin: unknown) => {
        if (origin === "database") return;
        if (cached.persistTimer) clearTimeout(cached.persistTimer);
        cached.persistTimer = setTimeout(() => {
          persistDocument(documentId, doc).catch((persistError) =>
            console.error("Yjs state persistence failed", persistError),
          );
        }, 350);
      });
      return cached;
    })();
    documents.set(documentId, pending);
  }

  try {
    return await pending;
  } catch (error) {
    documents.delete(documentId);
    throw error;
  }
};

export const applyCollaborationUpdate = async (documentId: string, updateBase64: string) => {
  const Y = await loadYjs();
  const update = decodeUpdate(updateBase64);
  if (!update?.length || update.length > 2_000_000) throw new Error("Invalid collaboration update");
  const cached = await getCollaborationDocument(documentId);
  Y.applyUpdate(cached.doc, update, "socket");
  return update;
};

export const getCollaborationState = async (documentId: string) => {
  const Y = await loadYjs();
  const cached = await getCollaborationDocument(documentId);
  const update = Y.encodeStateAsUpdate(cached.doc);
  return update.length > 2 ? encodeUpdate(update) : null;
};
