import axios from "axios";
import { useEffect, useState } from "react";
import WorkspaceLayout from "../components/WorkspaceLayout";
import api from "../services/api";
import { AnalyticsResponse } from "../types";

const formatNumber = (value: number) => new Intl.NumberFormat().format(value || 0);

const AnalyticsPage = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAnalytics = async (nextDays: number) => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get<AnalyticsResponse>("/docs/analytics", {
        params: { days: nextDays },
      });
      setData(response.data);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Analytics load failed");
      } else {
        setError("Analytics load failed");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(days).catch(console.error);
  }, []);

  const summaryItems = data
    ? [
        { label: "Total Documents", value: data.summary.totalDocuments },
        { label: "Owned", value: data.summary.ownedDocuments },
        { label: "Shared With Me", value: data.summary.sharedWithMe },
        { label: "Views", value: data.summary.views },
        { label: "Edits", value: data.summary.edits },
        { label: "Shares", value: data.summary.shares },
        { label: "Imports", value: data.summary.imports },
        { label: "Exports", value: data.summary.exports },
        { label: "Comments", value: data.summary.comments },
        { label: "Snapshots", value: data.summary.versions },
      ]
    : [];

  const maxTimelineEvents = Math.max(1, ...(data?.timeline.map((item) => item.events) || [1]));

  return (
    <WorkspaceLayout pageLabel="Engagement Insights" title="Analytics Dashboard">
      <div className="space-y-6">
        <section className="flex flex-wrap items-center gap-3 rounded border border-white/5 bg-surface-container p-4">
          {[7, 30, 90].map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => {
                setDays(range);
                fetchAnalytics(range).catch(console.error);
              }}
              className={`rounded px-3 py-2 text-xs font-bold uppercase tracking-widest transition ${
                days === range ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              {range} days
            </button>
          ))}
        </section>

        {error ? <div className="rounded border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div> : null}

        {loading ? (
          <div className="rounded border border-white/5 bg-surface-container p-6 text-sm text-on-surface-variant">
            Loading analytics...
          </div>
        ) : data ? (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {summaryItems.map((item) => (
                <article key={item.label} className="rounded border border-white/5 bg-surface-container p-4">
                  <p className="text-[10px] uppercase tracking-widest text-on-surface-variant">{item.label}</p>
                  <p className="mt-2 text-2xl font-bold text-white">{formatNumber(item.value)}</p>
                </article>
              ))}
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <article className="rounded border border-white/5 bg-surface-container p-5">
                <h2 className="text-lg font-bold text-white">Activity timeline</h2>
                <div className="mt-4 space-y-2">
                  {data.timeline.length ? (
                    data.timeline.map((item) => (
                      <div key={item.date} className="flex items-center gap-3">
                        <span className="w-20 text-xs text-on-surface-variant">{item.date.slice(5)}</span>
                        <div className="h-2 flex-1 rounded bg-surface-container-high">
                          <div
                            className="h-2 rounded bg-primary"
                            style={{ width: `${Math.max(4, (item.events / maxTimelineEvents) * 100)}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs text-white">{item.events}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-on-surface-variant">No activity recorded in this period.</p>
                  )}
                </div>
              </article>

              <article className="rounded border border-white/5 bg-surface-container p-5">
                <h2 className="text-lg font-bold text-white">Top active docs</h2>
                <div className="mt-4 space-y-3">
                  {data.topDocs.length ? (
                    data.topDocs.map((doc) => (
                      <div key={doc.documentId} className="rounded border border-white/10 bg-surface-container-high p-3">
                        <p className="text-sm font-semibold text-white">{doc.title}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">{doc.events} tracked events</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-on-surface-variant">No document activity yet.</p>
                  )}
                </div>
              </article>
            </section>
          </>
        ) : null}
      </div>
    </WorkspaceLayout>
  );
};

export default AnalyticsPage;
