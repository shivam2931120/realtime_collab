import { create } from "zustand";

export type DocumentRole = "owner" | "editor" | "viewer";

export type Collaborator = {
  id: string;
  email: string;
  role: "editor" | "viewer";
};

export type DocItem = {
  id: string;
  title: string;
  content: string;
  owner: {
    id: string;
    email: string;
  };
  collaborators: Collaborator[];
  role: DocumentRole;
  folderId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FolderItem = {
  id: string;
  name: string;
  owner_id: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
};

type DocState = {
  docs: DocItem[];
  folders: FolderItem[];
  activeDoc: DocItem | null;
  setDocs: (docs: DocItem[]) => void;
  setFolders: (folders: FolderItem[]) => void;
  setActiveDoc: (doc: DocItem | null) => void;
  upsertDoc: (doc: DocItem) => void;
  upsertFolder: (folder: FolderItem) => void;
  removeDoc: (id: string) => void;
  removeFolder: (id: string) => void;
  clearDocs: () => void;
};

export const useDocStore = create<DocState>((set) => ({
  docs: [],
  folders: [],
  activeDoc: null,
  setDocs: (docs) => set({ docs }),
  setFolders: (folders) => set({ folders }),
  setActiveDoc: (doc) => set({ activeDoc: doc }),
  upsertDoc: (doc) =>
    set((state) => {
      const nextDocs = [...state.docs];
      const existingIndex = nextDocs.findIndex((item) => item.id === doc.id);

      if (existingIndex >= 0) {
        nextDocs[existingIndex] = doc;
      } else {
        nextDocs.unshift(doc);
      }

      return {
        docs: nextDocs.sort(
          (first, second) =>
            new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime(),
        ),
        activeDoc: state.activeDoc?.id === doc.id ? doc : state.activeDoc,
      };
    }),
  upsertFolder: (folder) =>
    set((state) => {
      const nextFolders = [...state.folders];
      const existingIndex = nextFolders.findIndex((item) => item.id === folder.id);
      if (existingIndex >= 0) {
        nextFolders[existingIndex] = folder;
      } else {
        nextFolders.unshift(folder);
      }
      return { folders: nextFolders };
    }),
  removeDoc: (id) =>
    set((state) => ({
      docs: state.docs.filter((d) => d.id !== id),
      activeDoc: state.activeDoc?.id === id ? null : state.activeDoc,
    })),
  removeFolder: (id) =>
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
    })),
  clearDocs: () => set({ docs: [], folders: [], activeDoc: null }),
}));
