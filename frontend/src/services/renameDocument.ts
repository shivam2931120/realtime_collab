import api from "./api";
import { DocItem, useDocStore } from "../store/docStore";

export async function renameDocument(id: string, name: string) {
  const title = name.trim();
  if (!title) throw new Error("Enter a document name.");
  const { data } = await api.put<{ document: DocItem }>(`/docs/${id}`, { title });
  const state = useDocStore.getState();
  const current = state.activeDoc?.id === id ? state.activeDoc : state.docs.find(doc => doc.id === id);
  // A title response must not replace newer local edits to the document body.
  const document = { ...(current || data.document), title: data.document.title, updatedAt: data.document.updatedAt };
  state.upsertDoc(document);
  return document;
}
