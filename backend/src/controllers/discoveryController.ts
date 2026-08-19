import { Response } from "express";
import TurndownService from "turndown";
import { htmlToText } from "html-to-text";
import PDFDocument from "pdfkit";
import mammoth from "mammoth";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { AuthRequest } from "../middleware/authMiddleware";
import { supabase } from "../config/supabase";
import { trackDocumentEvent } from "../utils/analytics";
import { isMissingTableError } from "../utils/dbErrors";
import { getCache, setCache, invalidateCachePrefix, publishEvent } from "../utils/redis";
import { emailFromUserId } from "../utils/userIdentity";
import { createEmbeddings, isNvidiaConfigured } from "../utils/nvidiaAi";

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });

type AccessibleDocument = {
  id: string;
  title: string;
  content: string;
  owner_id: string;
  folder_id?: string | null;
  updated_at: string;
  created_at: string;
  deleted_at?: string | null;
};

type CollaboratorRole = "editor" | "commenter" | "viewer";
type DocumentRole = "owner" | CollaboratorRole;

const normalizeRole = (role: unknown): CollaboratorRole => {
  if (role === "viewer") return "viewer";
  if (role === "commenter") return "commenter";
  return "editor";
};

const canEditDocument = (role: DocumentRole | null) => role === "owner" || role === "editor";

const normalizeTags = (raw: unknown) => {
  if (!Array.isArray(raw)) {
    return [] as string[];
  }

  return [
    ...new Set(
      raw
        .map((tag) => String(tag || "").trim().toLowerCase())
        .filter((tag) => Boolean(tag) && tag.length <= 40)
        .map((tag) => tag.replace(/\s+/g, "-")),
    ),
  ];
};

const getActorEmail = async (userId: string) => {
  return emailFromUserId(userId);
};

const stripHtml = (value: string) => htmlToText(value || "", { wordwrap: false });

const buildSnippet = (value: string, maxLength = 220) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1)}...`;
};

const cosineSimilarity = (left: number[], right: number[]) => {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm) || 1);
};

const extractAttachmentText = (html: string) =>
  Array.from(html.matchAll(/<(?:img|a)[^>]+(?:alt|title|href)=["']([^"']+)["'][^>]*>/gi))
    .map((match) => match[1])
    .join(" ");

const parseDataUrlBase64 = (value: string) => {
  const base64 = value.includes(",") ? value.split(",")[1] : value;
  return Buffer.from(base64, "base64");
};

const buildPdfBuffer = (title: string, text: string) =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text(title, { underline: true });
    doc.moveDown();
    doc.fontSize(11).text(text || "", { lineGap: 2 });
    doc.end();
  });

const getAccessibleDocuments = async (userId: string): Promise<AccessibleDocument[]> => {
  const { data: ownedDocs, error: ownedError } = await supabase
    .from("documents")
    .select("id,title,content,owner_id,folder_id,updated_at,created_at,deleted_at")
    .eq("owner_id", userId);

  if (ownedError) {
    throw ownedError;
  }

  const { data: collabRows, error: collabError } = await supabase
    .from("document_collaborators")
    .select("document_id")
    .eq("user_id", userId);

  if (collabError) {
    throw collabError;
  }

  const collabDocIds = [...new Set((collabRows || []).map((row: any) => row.document_id))];

  let collabDocs: AccessibleDocument[] = [];
  if (collabDocIds.length > 0) {
    const { data, error } = await supabase
      .from("documents")
      .select("id,title,content,owner_id,folder_id,updated_at,created_at,deleted_at")
      .in("id", collabDocIds);

    if (error) {
      throw error;
    }

    collabDocs = (data || []) as AccessibleDocument[];
  }

  const map = new Map<string, AccessibleDocument>();
  (ownedDocs || []).filter((doc: any) => !doc.deleted_at).forEach((doc: any) => map.set(doc.id, doc));
  collabDocs.filter((doc) => !doc.deleted_at).forEach((doc) => map.set(doc.id, doc));

  return [...map.values()].sort(
    (first, second) => new Date(second.updated_at).getTime() - new Date(first.updated_at).getTime(),
  );
};

const loadTagsByDocumentIds = async (documentIds: string[]) => {
  if (!documentIds.length) {
    return new Map<string, string[]>();
  }

  const { data, error } = await supabase
    .from("document_tags")
    .select("document_id, tag")
    .in("document_id", documentIds);

  if (error) {
    throw error;
  }

  const map = new Map<string, string[]>();
  (data || []).forEach((row: any) => {
    const existing = map.get(row.document_id) || [];
    existing.push(String(row.tag));
    map.set(row.document_id, existing);
  });

  return map;
};

const loadCommentsByDocumentIds = async (documentIds: string[]) => {
  if (!documentIds.length) {
    return new Map<string, Array<{ id: string; content: string; author: string }>>();
  }

  const { data, error } = await supabase
    .from("comments")
    .select("id, document_id, user_id, content")
    .in("document_id", documentIds)
    .limit(1000);

  if (error) {
    throw error;
  }

  const map = new Map<string, Array<{ id: string; content: string; author: string }>>();
  (data || []).forEach((row: any) => {
    const existing = map.get(row.document_id) || [];
    existing.push({
      id: String(row.id),
      content: String(row.content || ""),
      author: emailFromUserId(row.user_id),
    });
    map.set(row.document_id, existing);
  });

  return map;
};

const loadCollaboratorsByDocumentIds = async (documentIds: string[]) => {
  if (!documentIds.length) {
    return new Map<string, Array<{ email: string; role: CollaboratorRole }>>();
  }

  const { data, error } = await supabase
    .from("document_collaborators")
    .select("document_id, user_id, role")
    .in("document_id", documentIds);

  if (error) {
    throw error;
  }

  const map = new Map<string, Array<{ email: string; role: CollaboratorRole }>>();
  (data || []).forEach((row: any) => {
    const existing = map.get(row.document_id) || [];
    existing.push({ email: emailFromUserId(row.user_id), role: normalizeRole(row.role) });
    map.set(row.document_id, existing);
  });

  return map;
};

const loadFolderNamesByIds = async (folderIds: string[]) => {
  const uniqueIds = [...new Set(folderIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from("folders")
    .select("id, name")
    .in("id", uniqueIds);

  if (error) {
    throw error;
  }

  return new Map((data || []).map((row: any) => [row.id, String(row.name || "")]));
};

const getDocumentAndRole = async (documentId: string, userId: string) => {
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id,title,content,owner_id,updated_at,created_at,deleted_at,document_collaborators(user_id,role)")
    .eq("id", documentId)
    .single();

  if (error || !doc || doc.deleted_at) {
    return { doc: null, role: null as null | DocumentRole };
  }

  if (doc.owner_id === userId) {
    return { doc, role: "owner" as const };
  }

  const collaborator = (doc.document_collaborators || []).find((item: any) => item.user_id === userId);
  if (!collaborator) {
    return { doc: null, role: null as null | DocumentRole };
  }

  return { doc, role: normalizeRole(collaborator.role) };
};

const syncDocumentTags = async (documentId: string, tags: string[]) => {
  await supabase.from("document_tags").delete().eq("document_id", documentId);

  if (tags.length > 0) {
    await supabase
      .from("document_tags")
      .insert(tags.map((tag) => ({ document_id: documentId, tag })));
  }

  await invalidateCachePrefix("search:");
  await invalidateCachePrefix("popular-tags:");
  await publishEvent("docs:tags", { documentId, tags });
};

export const searchDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = auth.userId;
    const query = String(req.query.q || "").trim().toLowerCase();
    const requestedMode = String(req.query.mode || "keyword") === "semantic" ? "semantic" : "keyword";
    const selectedTags = String(req.query.tags || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    const cacheKey = `search:${requestedMode}:${userId}:${query}:${selectedTags.join("|")}`;
    const cached = await getCache<{ query: string; tags: string[]; results: any[] }>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const docs = await getAccessibleDocuments(userId);
    const documentIds = docs.map((doc) => doc.id);
    const [tagsByDocId, commentsByDocId, collaboratorsByDocId, folderNamesById, versionsResponse] = await Promise.all([
      loadTagsByDocumentIds(documentIds).catch(() => new Map<string, string[]>()),
      loadCommentsByDocumentIds(documentIds).catch(() => new Map<string, Array<{ id: string; content: string; author: string }>>()),
      loadCollaboratorsByDocumentIds(documentIds).catch(() => new Map<string, Array<{ email: string; role: CollaboratorRole }>>()),
      loadFolderNamesByIds(docs.map((doc) => doc.folder_id || "").filter(Boolean)).catch(() => new Map<string, string>()),
      documentIds.length
        ? supabase.from("document_versions").select("document_id,content").in("document_id", documentIds).limit(500)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const versionsByDocId = new Map<string, string[]>();
    for (const version of versionsResponse.data || []) {
      const existing = versionsByDocId.get(version.document_id) || [];
      existing.push(stripHtml(version.content || ""));
      versionsByDocId.set(version.document_id, existing);
    }

    let semanticScores = new Map<string, number>();
    let semanticAvailable = false;
    if (requestedMode === "semantic" && query && isNvidiaConfigured() && docs.length) {
      try {
        const passages = docs.map((doc) => {
          const comments = (commentsByDocId.get(doc.id) || []).map((comment) => stripHtml(comment.content)).join(" ");
          const versions = (versionsByDocId.get(doc.id) || []).slice(0, 8).join(" ");
          return `${doc.title}\n${stripHtml(doc.content || "")}\nComments: ${comments}\nAttachments: ${extractAttachmentText(doc.content || "")}\nPrevious versions: ${versions}`.slice(0, 12_000);
        });
        const [queryEmbedding] = await createEmbeddings([query], "query");
        const passageEmbeddings = await createEmbeddings(passages, "passage");
        semanticScores = new Map(docs.map((doc, index) => [doc.id, cosineSimilarity(queryEmbedding, passageEmbeddings[index] || [])]));
        semanticAvailable = true;
      } catch (semanticError) {
        console.error("Semantic search unavailable; using keyword search", semanticError instanceof Error ? semanticError.message : semanticError);
      }
    }

    const results = docs
      .map((doc) => {
        const text = stripHtml(doc.content || "");
        const tags: string[] = tagsByDocId.get(doc.id) || [];
        const commentText = (commentsByDocId.get(doc.id) || []).map((comment) => stripHtml(comment.content)).join(" ");
        const collaborators = collaboratorsByDocId.get(doc.id) || [];
        const collaboratorText = collaborators.map((collaborator) => `${collaborator.email} ${collaborator.role}`).join(" ");
        const ownerEmail = emailFromUserId(doc.owner_id);
        const folderName = doc.folder_id ? folderNamesById.get(doc.folder_id) || "" : "";
        const haystack = `${doc.title} ${text} ${tags.join(" ")} ${commentText} ${collaboratorText} ${ownerEmail} ${folderName}`.toLowerCase();

        const semanticScore = semanticScores.get(doc.id) || 0;
        const matchesQuery = !query || (semanticAvailable ? semanticScore > 0 : haystack.includes(query));
        const matchesTags = !selectedTags.length || selectedTags.every((tag) => tags.includes(tag));

        if (!matchesQuery || !matchesTags) {
          return null;
        }

        let score = 0;
        if (semanticAvailable) score += semanticScore * 100;
        if (query) {
          if (doc.title.toLowerCase().includes(query)) {
            score += 12;
          }
          if (text.toLowerCase().includes(query)) {
            score += 5;
          }
          if (commentText.toLowerCase().includes(query)) {
            score += 4;
          }
          if (collaboratorText.toLowerCase().includes(query) || ownerEmail.toLowerCase().includes(query)) {
            score += 3;
          }
          if (folderName.toLowerCase().includes(query)) {
            score += 2;
          }
          score += tags.filter((tag) => tag.includes(query)).length * 2;
        }

        score += Math.max(
          0,
          5 - Math.floor((Date.now() - new Date(doc.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
        );

        return {
          id: doc.id,
          title: doc.title,
          snippet: buildSnippet(text || commentText || folderName || ownerEmail),
          tags,
          owner: { id: doc.owner_id, email: ownerEmail },
          folder: doc.folder_id ? { id: doc.folder_id, name: folderName } : null,
          collaborators: collaborators.slice(0, 12),
          matchedComments: (commentsByDocId.get(doc.id) || []).slice(0, 3).map((comment) => ({
            id: comment.id,
            body: buildSnippet(stripHtml(comment.content), 140),
            author: comment.author,
          })),
          updatedAt: doc.updated_at,
          score,
          semanticScore: semanticAvailable ? Number(semanticScore.toFixed(4)) : null,
          matchMode: semanticAvailable ? "semantic" : "keyword",
        };
      })
      .filter(Boolean)
      .sort((first: any, second: any) => second.score - first.score);

    const payload = { query, tags: selectedTags, mode: semanticAvailable ? "semantic" : "keyword", results };
    await setCache(cacheKey, payload, 45);

    return res.json(payload);
  } catch (error) {
    console.error("Search documents failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using search/tags.",
      });
    }
    return res.status(500).json({ message: "Search failed" });
  }
};

export const getPopularTags = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const cacheKey = `popular-tags:${auth.userId}`;
    const cached = await getCache<{ tags: Array<{ name: string; count: number }> }>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const docs = await getAccessibleDocuments(auth.userId);
    const tagsByDocId = await loadTagsByDocumentIds(docs.map((doc) => doc.id)).catch(() => new Map());
    const counts = new Map<string, number>();

    docs.forEach((doc) => {
      (tagsByDocId.get(doc.id) || []).forEach((tag: string) => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });

    const tags = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((first, second) => second.count - first.count)
      .slice(0, 30);

    const payload = { tags };
    await setCache(cacheKey, payload, 60);
    return res.json(payload);
  } catch (error) {
    console.error("Get tags failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using tags.",
      });
    }
    return res.status(500).json({ message: "Tags fetch failed" });
  }
};

export const getDocumentTags = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { doc, role } = await getDocumentAndRole(req.params.id, auth.userId);
    if (!doc) {
      return res.status(404).json({ message: "Document nahi mila" });
    }
    if (!canEditDocument(role)) {
      return res.status(403).json({ message: "Only owners and editors can export documents" });
    }

    const tagsByDoc = await loadTagsByDocumentIds([req.params.id]).catch(() => new Map());
    return res.json({ tags: tagsByDoc.get(req.params.id) || [] });
  } catch (error) {
    console.error("Get document tags failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using tags.",
      });
    }
    return res.status(500).json({ message: "Document tags fetch failed" });
  }
};

export const updateDocumentTags = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { doc, role } = await getDocumentAndRole(req.params.id, auth.userId);
    if (!doc || !role) {
      return res.status(404).json({ message: "Document nahi mila" });
    }

    if (!canEditDocument(role)) {
      return res.status(403).json({ message: "Only owners and editors can update tags" });
    }

    const tags = normalizeTags(req.body.tags);
    await syncDocumentTags(req.params.id, tags);

    await trackDocumentEvent({
      documentId: req.params.id,
      actorId: auth.userId,
      eventType: "document_updated",
      metadata: { scope: "tags", tagsCount: tags.length },
    });

    return res.json({ tags });
  } catch (error) {
    console.error("Update document tags failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using tags.",
      });
    }
    return res.status(500).json({ message: "Document tags update failed" });
  }
};

export const listTemplates = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const defaults = [
      {
        id: "default-product-brief",
        title: "Product Brief",
        content:
          "<h1>Product Brief</h1><h2>Objective</h2><p></p><h2>Audience</h2><p></p><h2>Success Metrics</h2><ul><li></li></ul>",
        tags: ["brief", "product"],
        isSystem: true,
      },
      {
        id: "default-meeting-notes",
        title: "Meeting Notes",
        content:
          "<h1>Meeting Notes</h1><p><strong>Date:</strong></p><p><strong>Attendees:</strong></p><h2>Agenda</h2><ul><li></li></ul><h2>Decisions</h2><ul><li></li></ul><h2>Action Items</h2><ul><li></li></ul>",
        tags: ["meeting", "notes"],
        isSystem: true,
      },
    ];

    const { data: dbTemplates } = await supabase
      .from("document_templates")
      .select("id,title,content,tags,is_system,created_at,updated_at")
      .or(`owner_id.eq.${auth.userId},is_system.eq.true`)
      .order("updated_at", { ascending: false });

    const mappedDbTemplates = (dbTemplates || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      tags: Array.isArray(item.tags) ? item.tags : [],
      isSystem: Boolean(item.is_system),
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    return res.json({ templates: [...defaults, ...mappedDbTemplates] });
  } catch (error) {
    console.error("List templates failed", error);
    return res.status(500).json({ message: "Templates fetch failed" });
  }
};

export const createTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const title = String(req.body.title || "").trim();
    const content = String(req.body.content || "").trim();
    if (!title || !content) {
      return res.status(400).json({ message: "Template title/content required hai" });
    }

    const tags = normalizeTags(req.body.tags);

    const { data: template, error } = await supabase
      .from("document_templates")
      .insert({ owner_id: auth.userId, title, content, tags, is_system: false })
      .select("id,title,content,tags,is_system,created_at,updated_at")
      .single();

    if (error || !template) {
      throw error;
    }

    await publishEvent("docs:templates", { action: "create", templateId: template.id, actorId: auth.userId });

    return res.status(201).json({
      template: {
        id: template.id,
        title: template.title,
        content: template.content,
        tags: Array.isArray(template.tags) ? template.tags : [],
        isSystem: Boolean(template.is_system),
        createdAt: template.created_at,
        updatedAt: template.updated_at,
      },
    });
  } catch (error) {
    console.error("Create template failed", error);
    return res.status(500).json({ message: "Template create failed" });
  }
};

export const applyTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const templateId = req.params.templateId;
    const customTitle = String(req.body.title || "").trim();

    const defaults = new Map([
      [
        "default-product-brief",
        {
          title: "Product Brief",
          content:
            "<h1>Product Brief</h1><h2>Objective</h2><p></p><h2>Audience</h2><p></p><h2>Success Metrics</h2><ul><li></li></ul>",
          tags: ["brief", "product"],
        },
      ],
      [
        "default-meeting-notes",
        {
          title: "Meeting Notes",
          content:
            "<h1>Meeting Notes</h1><p><strong>Date:</strong></p><p><strong>Attendees:</strong></p><h2>Agenda</h2><ul><li></li></ul><h2>Decisions</h2><ul><li></li></ul><h2>Action Items</h2><ul><li></li></ul>",
          tags: ["meeting", "notes"],
        },
      ],
    ]);

    let sourceTemplate = defaults.get(templateId) || null;

    if (!sourceTemplate) {
      const { data: dbTemplate, error } = await supabase
        .from("document_templates")
        .select("id,owner_id,title,content,tags,is_system")
        .eq("id", templateId)
        .single();

      if (error || !dbTemplate) {
        return res.status(404).json({ message: "Template not found" });
      }

      if (!dbTemplate.is_system && dbTemplate.owner_id !== auth.userId) {
        return res.status(403).json({ message: "Forbidden template" });
      }

      sourceTemplate = {
        title: dbTemplate.title,
        content: dbTemplate.content,
        tags: Array.isArray(dbTemplate.tags) ? dbTemplate.tags : [],
      };
    }

    const { data: doc, error } = await supabase
      .from("documents")
      .insert({ title: customTitle || sourceTemplate.title, content: sourceTemplate.content, owner_id: auth.userId })
      .select("id,title,content,owner_id,created_at,updated_at")
      .single();

    if (error || !doc) {
      throw error;
    }

    await syncDocumentTags(doc.id, normalizeTags(sourceTemplate.tags));

    await trackDocumentEvent({
      documentId: doc.id,
      actorId: auth.userId,
      eventType: "document_created",
      metadata: { source: "template", templateId },
    });

    await publishEvent("docs:templates", {
      action: "apply",
      templateId,
      actorId: auth.userId,
      documentId: doc.id,
    });

    return res.status(201).json({
      document: {
        id: doc.id,
        title: doc.title,
        content: doc.content,
        owner: { id: doc.owner_id, email: await getActorEmail(auth.userId) },
        collaborators: [],
        role: "owner",
        folderId: null,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      },
    });
  } catch (error) {
    console.error("Apply template failed", error);
    return res.status(500).json({ message: "Template apply failed" });
  }
};

export const importDocument = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const title = String(req.body.title || "").trim();
    const format = String(req.body.format || "").trim().toLowerCase();
    const content = String(req.body.content || "");
    const tags = normalizeTags(req.body.tags);

    if (!title || !format || !content) {
      return res.status(400).json({ message: "Import title/format/content required hai" });
    }

    let html = "";

    if (format === "html") {
      html = content;
    } else if (format === "markdown") {
      const { marked } = await import("marked");
      html = await marked.parse(content);
    } else if (format === "text") {
      html = `<pre>${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
    } else if (format === "docx") {
      const buffer = parseDataUrlBase64(content);
      const converted = await mammoth.convertToHtml({ buffer });
      html = converted.value;
    } else {
      return res.status(400).json({ message: "Unsupported import format" });
    }

    const { data: doc, error } = await supabase
      .from("documents")
      .insert({ title, content: html, owner_id: auth.userId })
      .select("id,title,content,owner_id,created_at,updated_at")
      .single();

    if (error || !doc) {
      throw error;
    }

    await syncDocumentTags(doc.id, tags);

    await trackDocumentEvent({
      documentId: doc.id,
      actorId: auth.userId,
      eventType: "document_imported",
      metadata: { format },
    });

    await publishEvent("docs:import", { documentId: doc.id, actorId: auth.userId, format });

    return res.status(201).json({
      document: {
        id: doc.id,
        title: doc.title,
        content: doc.content,
        owner: { id: doc.owner_id, email: await getActorEmail(auth.userId) },
        collaborators: [],
        role: "owner",
        folderId: null,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      },
    });
  } catch (error) {
    console.error("Import document failed", error);
    return res.status(500).json({ message: "Import failed" });
  }
};

export const exportDocument = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { doc } = await getDocumentAndRole(req.params.id, auth.userId);
    if (!doc) {
      return res.status(404).json({ message: "Document nahi mila" });
    }

    const format = String(req.query.format || "markdown").toLowerCase();
    const text = stripHtml(doc.content || "");
    const safeName = doc.title.replace(/[^a-z0-9-_]+/gi, "_").toLowerCase();

    if (format === "html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.html"`);
      await trackDocumentEvent({ documentId: doc.id, actorId: auth.userId, eventType: "document_exported", metadata: { format: "html" } });
      return res.send(doc.content || "");
    }

    if (format === "txt" || format === "text") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.txt"`);
      await trackDocumentEvent({ documentId: doc.id, actorId: auth.userId, eventType: "document_exported", metadata: { format: "txt" } });
      return res.send(text);
    }

    if (format === "markdown" || format === "md") {
      const markdown = turndown.turndown(doc.content || "");
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.md"`);
      await trackDocumentEvent({ documentId: doc.id, actorId: auth.userId, eventType: "document_exported", metadata: { format: "markdown" } });
      return res.send(markdown);
    }

    if (format === "pdf") {
      const pdfBuffer = await buildPdfBuffer(doc.title, text);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
      await trackDocumentEvent({ documentId: doc.id, actorId: auth.userId, eventType: "document_exported", metadata: { format: "pdf" } });
      return res.send(pdfBuffer);
    }

    if (format === "docx") {
      const paragraphs = text
        .split(/\n+/)
        .map((line: string) => line.trim())
        .filter(Boolean)
        .map((line: string) => new Paragraph({ children: [new TextRun(line)] }));

      const output = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({ children: [new TextRun({ text: doc.title, bold: true, size: 32 })] }),
              ...paragraphs,
            ],
          },
        ],
      });

      const buffer = await Packer.toBuffer(output);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.docx"`);
      await trackDocumentEvent({ documentId: doc.id, actorId: auth.userId, eventType: "document_exported", metadata: { format: "docx" } });
      return res.send(buffer);
    }

    return res.status(400).json({ message: "Unsupported export format" });
  } catch (error) {
    console.error("Export document failed", error);
    return res.status(500).json({ message: "Export failed" });
  }
};

export const getAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = auth.userId;
    const days = Math.min(180, Math.max(1, Number(req.query.days || 30)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const docs = await getAccessibleDocuments(userId);
    const ownedCount = docs.filter((doc) => doc.owner_id === userId).length;
    const sharedCount = docs.length - ownedCount;
    const docIds = docs.map((doc) => doc.id);

    let events: any[] = [];
    if (docIds.length > 0) {
      const { data } = await supabase
        .from("document_events")
        .select("document_id,event_type,actor_id,created_at")
        .in("document_id", docIds)
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      events = data || [];
    }

    let commentsCount = 0;
    let versionsCount = 0;

    if (docIds.length > 0) {
      const [commentsResp, versionsResp] = await Promise.all([
        supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .in("document_id", docIds)
          .gte("created_at", since),
        supabase
          .from("document_versions")
          .select("id", { count: "exact", head: true })
          .in("document_id", docIds)
          .gte("created_at", since),
      ]);

      commentsCount = commentsResp.count || 0;
      versionsCount = versionsResp.count || 0;
    }

    const byType = events.reduce<Record<string, number>>((acc, event) => {
      acc[event.event_type] = (acc[event.event_type] || 0) + 1;
      return acc;
    }, {});

    const timelineMap = new Map<string, number>();
    events.forEach((event) => {
      const dayKey = new Date(event.created_at).toISOString().slice(0, 10);
      timelineMap.set(dayKey, (timelineMap.get(dayKey) || 0) + 1);
    });

    const timeline = [...timelineMap.entries()]
      .map(([date, eventsCountValue]) => ({ date, events: eventsCountValue }))
      .sort((first, second) => first.date.localeCompare(second.date));

    const docTitleMap = new Map(docs.map((doc) => [doc.id, doc.title]));
    const perDocCount = new Map<string, number>();
    events.forEach((event) => {
      perDocCount.set(event.document_id, (perDocCount.get(event.document_id) || 0) + 1);
    });

    const topDocs = [...perDocCount.entries()]
      .map(([documentId, eventsCountValue]) => ({
        documentId,
        title: docTitleMap.get(documentId) || "Untitled",
        events: eventsCountValue,
      }))
      .sort((first, second) => second.events - first.events)
      .slice(0, 8);

    return res.json({
      rangeDays: days,
      summary: {
        totalDocuments: docs.length,
        ownedDocuments: ownedCount,
        sharedWithMe: sharedCount,
        events: events.length,
        views: byType.document_viewed || 0,
        edits: byType.document_updated || 0,
        shares: byType.document_shared || 0,
        imports: byType.document_imported || 0,
        exports: byType.document_exported || 0,
        comments: commentsCount,
        versions: versionsCount,
      },
      timeline,
      topDocs,
    });
  } catch (error) {
    console.error("Get analytics failed", error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        message: "Database not initialized. Run supabase_schema.sql before using analytics.",
      });
    }
    return res.status(500).json({ message: "Analytics load failed" });
  }
};
