import axios from "axios";
import { FormEvent, ReactNode, Suspense, lazy, useEffect, useState } from "react";
import { Navigate, Route, Routes, Link, useLocation } from "react-router-dom";
import api from "./services/api";
import { useAuthStore } from "./store/authStore";
import { useDocStore } from "./store/docStore";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const DraftsPage = lazy(() => import("./pages/Drafts"));
const CollectionsPage = lazy(() => import("./pages/Collections"));
const TeamsPage = lazy(() => import("./pages/Teams"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const EditorPage = lazy(() => import("./pages/Editor"));
const DiscoverPage = lazy(() => import("./pages/Discover"));
const LibraryPage = lazy(() => import("./pages/Library"));
const AnalyticsPage = lazy(() => import("./pages/Analytics"));

type SessionResponse = {
  token: string;
  user: {
    id: string;
    email: string;
  };
};

const AuthScreen = ({ mode }: { mode: "login" | "register" }) => {
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submitLabel = mode === "register" ? "Create account" : "Sign in";
  const helperCopy =
    mode === "register" ? "Create your collaborative workspace profile." : "Continue to your workspace.";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await api.post<SessionResponse>("/auth/session", { email });
      setSession(response.data.token, response.data.user);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Authentication failed");
      } else {
        setError("Authentication failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black px-4">
      <div className="w-full max-w-md rounded border border-white/10 bg-surface-container p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white">{submitLabel}</h1>
        <p className="mt-2 text-sm text-on-surface-variant">{helperCopy}</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Work email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded border border-white/10 bg-surface px-3 py-2 text-sm text-white outline-none ring-primary/50 transition focus:ring-2"
              placeholder="you@company.com"
            />
          </div>
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <button type="submit" disabled={submitting} className="emerald-primary-button w-full justify-center">
            {submitting ? "Please wait..." : submitLabel}
          </button>
        </form>

        <p className="mt-6 text-sm text-on-surface-variant">
          {mode === "register" ? (
            <>
              Already have access?{" "}
              <Link className="text-primary hover:underline" to="/login">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link className="text-primary hover:underline" to="/register">
                Create account
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
};

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const token = useAuthStore((state) => state.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const SessionGate = () => {
  const location = useLocation();
  const token = useAuthStore((state) => state.token);

  if (token && (location.pathname === "/login" || location.pathname === "/register")) {
    return <Navigate to="/dashboard" replace />;
  }

  return null;
};

const App = () => {
  const hydrate = useAuthStore((state) => state.hydrate);
  const hydrated = useAuthStore((state) => state.hydrated);
  const token = useAuthStore((state) => state.token);
  const clearSession = useAuthStore((state) => state.clearSession);
  const clearDocs = useDocStore((state) => state.clearDocs);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated || !token) return;
    api.get("/auth/me").catch(() => {
      clearSession();
      clearDocs();
    });
  }, [hydrated, token, clearSession, clearDocs]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Loading session...
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
          Loading...
        </div>
      }
    >
      <SessionGate />
      <Routes>
        <Route path="/" element={<Navigate to={token ? "/dashboard" : "/login"} replace />} />
        <Route path="/login" element={<AuthScreen mode="login" />} />
        <Route path="/register" element={<AuthScreen mode="register" />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drafts"
          element={
            <ProtectedRoute>
              <DraftsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/collections"
          element={
            <ProtectedRoute>
              <CollectionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teams"
          element={
            <ProtectedRoute>
              <TeamsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/discover"
          element={
            <ProtectedRoute>
              <DiscoverPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/library"
          element={
            <ProtectedRoute>
              <LibraryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/editor/:id"
          element={
            <ProtectedRoute>
              <EditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/docs/:id"
          element={
            <ProtectedRoute>
              <EditorPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
};

export default App;
