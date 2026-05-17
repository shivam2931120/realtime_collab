export type AppNotification = {
  id: string;
  type: "document_shared" | "document_updated" | "document_created";
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actor: {
    id: string;
    email: string;
  };
  document: {
    id: string;
    title: string;
  };
};

export type DocComment = {
  id: string;
  body: string;
  resolved: boolean;
  createdAt: string;
  author: {
    id: string;
    email: string;
  };
};

export type SearchResultItem = {
  id: string;
  title: string;
  snippet: string;
  tags: string[];
  updatedAt: string;
  score: number;
};

export type TagCountItem = {
  name: string;
  count: number;
};

export type TemplateItem = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  isSystem: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type DocItem = {
  id: string;
  title: string;
  content: string;
  owner: {
    id: string;
    email: string;
  };
  collaborators: Array<{
    id: string;
    email: string;
    role: "editor" | "viewer";
  }>;
  role: "owner" | "editor" | "viewer";
  folderId?: string | null;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
};

export type AnalyticsResponse = {
  rangeDays: number;
  summary: {
    totalDocuments: number;
    ownedDocuments: number;
    sharedWithMe: number;
    events: number;
    views: number;
    edits: number;
    shares: number;
    imports: number;
    exports: number;
    comments: number;
    versions: number;
  };
  timeline: Array<{ date: string; events: number }>;
  topDocs: Array<{ documentId: string; title: string; events: number }>;
};
