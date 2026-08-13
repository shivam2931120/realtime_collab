import axios from "axios";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";

type PublicDocumentResponse = {
  document: {
    title: string;
    content: string;
    ownerEmail: string;
    updatedAt: string;
    expiresAt: string;
  };
};

const sanitizeDocumentHtml = (html: string) => {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script, iframe, object, embed, form").forEach((element) => element.remove());
  template.content.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const value = attribute.value.trim().toLowerCase();
      if (attribute.name.toLowerCase().startsWith("on") || value.startsWith("javascript:")) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return template.innerHTML;
};

const PublicDocument = () => {
  const { token } = useParams<{ token: string }>();
  const [document, setDocument] = useState<PublicDocumentResponse["document"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("This public link is invalid or expired.");
      setLoading(false);
      return;
    }

    api.get<PublicDocumentResponse>(`/docs/public/${token}`)
      .then((response) => setDocument(response.data.document))
      .catch((requestError) => {
        if (axios.isAxiosError(requestError)) {
          setError(requestError.response?.data?.message || "This public link is invalid or expired.");
        } else {
          setError("This public link is invalid or expired.");
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-on-background sm:px-8 md:px-16">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between border-b border-white/10 pb-4">
          <span className="text-lg font-bold uppercase tracking-tighter text-white">Editorial</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Public read-only view</span>
        </div>
        {loading ? <p className="text-sm text-on-surface-variant">Loading document...</p> : null}
        {error ? (
          <section className="rounded border border-error/30 bg-surface-container p-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-error">404</p>
            <h1 className="mt-2 text-2xl font-bold text-white">Document link unavailable</h1>
            <p className="mt-3 text-sm text-on-surface-variant">{error}</p>
          </section>
        ) : null}
        {document ? (
          <article className="rounded border border-white/10 bg-white p-6 text-[#131313] shadow-2xl sm:p-10 md:p-16">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#16805b]">Shared by {document.ownerEmail}</p>
            <h1 className="mt-3 text-3xl font-bold sm:text-5xl">{document.title}</h1>
            <p className="mt-3 text-xs text-[#737373]">Read-only until {new Date(document.expiresAt).toLocaleString()}</p>
            <div className="editorial-editor mt-10" dangerouslySetInnerHTML={{ __html: sanitizeDocumentHtml(document.content) }} />
          </article>
        ) : null}
      </div>
    </main>
  );
};

export default PublicDocument;
