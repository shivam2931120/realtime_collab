import axios from "axios";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";
import api from "../services/api";
import { DocItem, TemplateItem } from "../types";

const LibraryPage = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [error, setError] = useState("");

  const [templateTitle, setTemplateTitle] = useState("");
  const [templateContent, setTemplateContent] = useState("<h1>Template Title</h1><p>Start here...</p>");
  const [templateTags, setTemplateTags] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  const [importTitle, setImportTitle] = useState("");
  const [importFormat, setImportFormat] = useState<"markdown" | "html" | "text" | "docx">("markdown");
  const [importContent, setImportContent] = useState("");
  const [importTags, setImportTags] = useState("");
  const [importing, setImporting] = useState(false);

  const parseTags = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    setError("");

    try {
      const response = await api.get<{ templates: TemplateItem[] }>("/docs/templates");
      setTemplates(response.data.templates || []);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Templates load nahi hue");
      } else {
        setError("Templates load nahi hue");
      }
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    fetchTemplates().catch(console.error);
  }, []);

  const handleCreateTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingTemplate(true);
    setError("");

    try {
      await api.post("/docs/templates", {
        title: templateTitle.trim(),
        content: templateContent,
        tags: parseTags(templateTags),
      });

      setTemplateTitle("");
      setTemplateTags("");
      await fetchTemplates();
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Template create nahi hua");
      } else {
        setError("Template create nahi hua");
      }
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handleApplyTemplate = async (templateId: string, title: string) => {
    setError("");

    try {
      const response = await api.post<{ document: DocItem }>(`/docs/templates/${templateId}/apply`, {
        title,
      });

      navigate(`/editor/${response.data.document.id}`);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Template apply nahi hua");
      } else {
        setError("Template apply nahi hua");
      }
    }
  };

  const handleImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setImporting(true);
    setError("");

    try {
      const response = await api.post<{ document: DocItem }>("/docs/import", {
        title: importTitle.trim(),
        format: importFormat,
        content: importContent,
        tags: parseTags(importTags),
      });

      navigate(`/editor/${response.data.document.id}`);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Import failed");
      } else {
        setError("Import failed");
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <WorkspaceLayout pageLabel="Templates & Import" title="Library">
      <div className="space-y-6">
        {error ? <div className="rounded border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div> : null}

        <section className="rounded border border-white/5 bg-surface-container p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Templates</h2>
            <button type="button" onClick={() => fetchTemplates().catch(console.error)} className="emerald-muted-button">
              Refresh
            </button>
          </div>

          {loadingTemplates ? (
            <div className="rounded border border-white/5 bg-surface-container-high p-4 text-sm text-on-surface-variant">
              Loading templates...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((template) => (
                <div key={template.id} className="rounded border border-white/10 bg-surface-container-high p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-white">{template.title}</h3>
                    <span className="text-[10px] uppercase tracking-widest text-primary">
                      {template.isSystem ? "System" : "Custom"}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-sm text-on-surface-variant">
                    {template.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {template.tags.map((tag) => (
                      <span key={`${template.id}-${tag}`} className="rounded-full bg-primary/10 px-2 py-1 text-[11px] text-primary">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate(template.id, template.title)}
                    className="emerald-primary-button mt-4 w-full"
                  >
                    Use template
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <form onSubmit={handleCreateTemplate} className="rounded border border-white/5 bg-surface-container p-5 space-y-4">
            <h2 className="text-lg font-bold text-white">Create template</h2>
            <input
              className="emerald-input"
              placeholder="Template title"
              value={templateTitle}
              onChange={(event) => setTemplateTitle(event.target.value)}
              required
            />
            <textarea
              className="emerald-input min-h-[180px] resize-y"
              value={templateContent}
              onChange={(event) => setTemplateContent(event.target.value)}
              required
            />
            <input
              className="emerald-input"
              placeholder="tags: design, spec, handoff"
              value={templateTags}
              onChange={(event) => setTemplateTags(event.target.value)}
            />
            <button type="submit" disabled={creatingTemplate} className="emerald-primary-button w-full">
              {creatingTemplate ? "Saving..." : "Save template"}
            </button>
          </form>

          <form onSubmit={handleImport} className="rounded border border-white/5 bg-surface-container p-5 space-y-4">
            <h2 className="text-lg font-bold text-white">Import document</h2>
            <input
              className="emerald-input"
              placeholder="Document title"
              value={importTitle}
              onChange={(event) => setImportTitle(event.target.value)}
              required
            />
            <select
              className="emerald-input"
              value={importFormat}
              onChange={(event) => setImportFormat(event.target.value as "markdown" | "html" | "text" | "docx")}
            >
              <option value="markdown">Markdown</option>
              <option value="html">HTML</option>
              <option value="text">Plain Text</option>
              <option value="docx">DOCX (base64 content)</option>
            </select>
            <textarea
              className="emerald-input min-h-[180px] resize-y"
              placeholder={importFormat === "docx" ? "Paste base64 DOCX string or data URL" : "Paste content"}
              value={importContent}
              onChange={(event) => setImportContent(event.target.value)}
              required
            />
            <input
              className="emerald-input"
              placeholder="tags: sprint, proposal"
              value={importTags}
              onChange={(event) => setImportTags(event.target.value)}
            />
            <button type="submit" disabled={importing} className="emerald-primary-button w-full">
              {importing ? "Importing..." : "Import and open"}
            </button>
          </form>
        </section>
      </div>
    </WorkspaceLayout>
  );
};

export default LibraryPage;
