import axios from "axios";
import { FormEvent, useEffect, useRef, useState } from "react";
import { renameDocument } from "../services/renameDocument";

type Props = { documentId: string; title: string; onSaved: (title: string) => void; onCancel: () => void; canvas?: boolean };

export default function RenameDocumentForm({ documentId, title, onSaved, onCancel, canvas = false }: Props) {
  const [name, setName] = useState(title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current) return;
    if (!name.trim()) { setError("Enter a document name."); return; }
    if (name.trim() === title) { onSaved(title); return; }
    pending.current = true;
    setSaving(true);
    setError("");
    try { const document = await renameDocument(documentId, name); onSaved(document.title); }
    catch (cause) { setError(axios.isAxiosError(cause) ? cause.response?.data?.message || "Could not rename the document. Please try again." : "Could not rename the document. Please try again."); }
    finally { pending.current = false; setSaving(false); }
  };
  return <form className="space-y-3" onSubmit={submit} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!saving) onCancel(); }
  }} aria-busy={saving}>
    <label className="block text-xs font-medium text-on-surface-variant">
      Document name
      <input ref={input} className={`emerald-input mt-2 ${canvas ? "document-title-input" : ""}`} value={name} onChange={event => setName(event.target.value)} disabled={saving} aria-invalid={!!error} aria-describedby={error ? "rename-error" : undefined} autoComplete="off" required />
    </label>
    {error && <p id="rename-error" role="alert" className="text-sm text-error">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button className="emerald-primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save name"}</button>
      <button className="emerald-muted-button" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
    </div>
  </form>;
}
