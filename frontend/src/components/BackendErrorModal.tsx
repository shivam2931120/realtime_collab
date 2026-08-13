import { useEffect } from "react";
import { useUiStore } from "../store/uiStore";

const BackendErrorModal = () => {
  const backendError = useUiStore((state) => state.backendError);
  const clearBackendError = useUiStore((state) => state.clearBackendError);

  useEffect(() => {
    if (!backendError) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearBackendError();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [backendError, clearBackendError]);

  if (!backendError) return null;

  const isNotFound = backendError.status === 404;
  const title = isNotFound ? "Backend route not found" : "Backend unavailable";
  const description = isNotFound
    ? "The requested backend resource does not exist or is no longer available."
    : "Editorial could not reach the backend. Your local editor changes remain available where offline mode supports them.";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="backend-error-title"
        className="w-full max-w-md rounded border border-error/30 bg-surface-container p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-error-container/30 text-error">
            <span className="material-symbols-outlined">cloud_off</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-error">
              {isNotFound ? "404" : backendError.status ? `HTTP ${backendError.status}` : "Connection error"}
            </p>
            <h2 id="backend-error-title" className="mt-1 text-lg font-bold text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">{description}</p>
            {backendError.message ? (
              <p className="mt-3 break-words rounded bg-surface px-3 py-2 text-xs text-error">{backendError.message}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={clearBackendError} className="emerald-muted-button justify-center">
            Dismiss
          </button>
          <button type="button" onClick={() => window.location.reload()} className="emerald-primary-button justify-center">
            <span className="material-symbols-outlined text-sm">refresh</span>
            Retry connection
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackendErrorModal;
