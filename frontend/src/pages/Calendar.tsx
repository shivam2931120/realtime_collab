import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import WorkspaceLayout from "../components/WorkspaceLayout";
import api from "../services/api";
import { DocItem } from "../types";
type Deadline = { id: string; documentId: string; title: string; description: string; dueAt: string; status: "open" | "completed" | "cancelled" };
const CalendarPage = () => {
  const [docs, setDocs] = useState<DocItem[]>([]); const [deadlines, setDeadlines] = useState<Deadline[]>([]); const [error, setError] = useState("");
  useEffect(() => { api.get<{ documents: DocItem[] }>("/docs").then(async (response) => { setDocs(response.data.documents); const results = await Promise.all(response.data.documents.map((doc) => api.get<{ deadlines: Deadline[] }>(`/docs/${doc.id}/deadlines`).then((value) => value.data.deadlines).catch(() => []))); setDeadlines(results.flat()); }).catch(() => setError("Calendar could not be loaded.")); }, []);
  const names = useMemo(() => new Map(docs.map((doc) => [doc.id, doc.title])), [docs]);
  const download = async () => { const response = await api.get("/calendar.ics", { responseType: "blob" }); const url = URL.createObjectURL(response.data); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "editorial-deadlines.ics"; anchor.click(); URL.revokeObjectURL(url); };
  return <WorkspaceLayout pageLabel="Schedule" title="Deadlines" actions={<button onClick={download} className="emerald-primary-button"><span className="material-symbols-outlined text-sm">calendar_add_on</span>Export calendar</button>}>
    {error ? <p className="mb-4 text-error">{error}</p> : null}<div className="space-y-3">{deadlines.length ? deadlines.sort((a,b) => Date.parse(a.dueAt)-Date.parse(b.dueAt)).map((item) => <Link key={item.id} to={`/editor/${item.documentId}`} className="flex flex-col gap-2 rounded border border-white/5 bg-surface-container p-5 transition hover:border-primary/30 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-white">{item.title}</h2><p className="mt-1 text-xs text-on-surface-variant">{names.get(item.documentId)}{item.description ? ` · ${item.description}` : ""}</p></div><div className="text-left sm:text-right"><p className="text-sm font-semibold text-primary">{new Date(item.dueAt).toLocaleString()}</p><p className="mt-1 text-[10px] uppercase tracking-widest text-on-surface-variant">{item.status}</p></div></Link>) : <div className="rounded border border-white/5 bg-surface-container p-6 text-sm text-on-surface-variant">No document deadlines yet. Add one from a document editor.</div>}</div>
  </WorkspaceLayout>;
};
export default CalendarPage;
