import axios from "axios";
import { FormEvent, ReactNode, Suspense, lazy, useEffect, useState } from "react";
import { Navigate, Route, Routes, Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import api from "./services/api";
import { useAuthStore } from "./store/authStore";
import { useDocStore } from "./store/docStore";
import BackendErrorModal from "./components/BackendErrorModal";
import { HandleSSOCallback, RedirectToTasks } from "@clerk/react";
import { clerkEnabled } from "./services/auth";
import { GoogleButton } from "./components/GoogleSignInButton";
import ClerkAuthForm from "./components/ClerkAuthForm";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const DraftsPage = lazy(() => import("./pages/Drafts"));
const CollectionsPage = lazy(() => import("./pages/Collections"));
const TeamsPage = lazy(() => import("./pages/Teams"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const EditorPage = lazy(() => import("./pages/Editor"));
const DiscoverPage = lazy(() => import("./pages/Discover"));
const LibraryPage = lazy(() => import("./pages/Library"));
const AnalyticsPage = lazy(() => import("./pages/Analytics"));
const PublicDocumentPage = lazy(() => import("./pages/PublicDocument"));
const IntegrationsPage = lazy(() => import("./pages/Integrations"));
const CalendarPage = lazy(() => import("./pages/Calendar"));

type SessionResponse = {
  token: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
  };
};

const AuthScreen = ({ mode }: { mode: "login" | "register" }) => {
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const submitLabel = mode === "register" ? "Create account" : "Sign in";
  const helperCopy =
    mode === "register" ? "Create your collaborative workspace profile." : "Continue to your workspace.";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await api.post<SessionResponse>(mode === "register" ? "/auth/register" : "/auth/login", {
        email,
        password,
      });
      setSession(response.data.token, response.data.user, response.data.refreshToken);
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

  const handleDemoSession = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await api.post<SessionResponse>("/auth/session", { email: "demo@example.com" });
      setSession(response.data.token, response.data.user);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Demo sign-in failed");
      } else {
        setError("Demo sign-in failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const requestReset = async () => {
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await api.post("/auth/password-reset/request", { email });
      setResetSent(true);
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Reset request failed");
      } else {
        setError("Reset request failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a href="/about.html" className="auth-brand"><img src="/favicon.ico" alt="" />Editorial</a>
        <h1>{submitLabel}</h1>
        <p className="auth-helper">{helperCopy}</p>

        <GoogleButton unavailable />
        <div className="auth-divider"><span>or use email</span></div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="auth-label">
              Work email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="auth-input"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="auth-label">
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="auth-input"
              placeholder="At least 8 characters"
            />
          </div>
          {error ? <p className="text-sm text-error">{error}</p> : null}
          {resetSent ? <p className="text-sm text-primary">Reset instructions sent if the account exists.</p> : null}
          <button type="submit" disabled={submitting} className="auth-primary-button">
            {submitting ? "Please wait..." : submitLabel}
          </button>
        </form>

        <button
          type="button"
          disabled={submitting}
          onClick={handleDemoSession}
          className="auth-secondary-button mt-3"
        >
          Continue with demo
        </button>

        <p className="auth-switch mt-6">
          {mode === "register" ? (
            <>
              Already have access?{" "}
              <Link to="/login">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link to="/register">
                Create account
              </Link>
            </>
          )}
        </p>
        {mode === "login" ? (
          <button
            type="button"
            onClick={requestReset}
            className="auth-link mt-3"
            disabled={submitting}
          >
            Forgot password?
          </button>
        ) : null}
        <p className="auth-legal mt-6">
          <a className="hover:underline" href="/about.html">About</a>
          <span aria-hidden="true"> · </span>
          <a className="hover:underline" href="/privacy.html">Privacy Policy</a>
          <span aria-hidden="true"> · </span>
          <a className="hover:underline" href="/terms.html">Terms of Service</a>
        </p>
      </section>
    </main>
  );
};

const GoogleCallbackScreen = () => {
  const navigate = useNavigate();
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Completing sign-in</h1>
        <HandleSSOCallback
          navigateToApp={({ session, decorateUrl }) => {
            const destination = decorateUrl(session?.currentTask ? "/auth/tasks" : "/dashboard");
            if (destination.startsWith("http")) window.location.assign(destination);
            else navigate(destination, { replace: true });
          }}
          navigateToSignIn={() => navigate("/login", { replace: true })}
          navigateToSignUp={() => navigate("/register", { replace: true })}
        />
      </section>
    </main>
  );
};

const ResetPasswordScreen = () => {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const token = searchParams.get("token") || "";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setStatus("");

    try {
      await api.post("/auth/password-reset/confirm", { token, password });
      setStatus("Password updated. You can sign in now.");
      setPassword("");
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        setError(requestError.response?.data?.message || "Password reset failed");
      } else {
        setError("Password reset failed");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a href="/about.html" className="auth-brand"><img src="/favicon.ico" alt="" />Editorial</a>
        <h1>Reset password</h1>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="auth-input"
            placeholder="New password"
          />
          {error ? <p className="text-sm text-error">{error}</p> : null}
          {status ? <p className="text-sm text-primary">{status}</p> : null}
          <button type="submit" disabled={submitting || !token} className="auth-primary-button">
            {submitting ? "Saving..." : "Update password"}
          </button>
        </form>
        <Link className="auth-link mt-5 inline-block" to="/login">
          Back to sign in
        </Link>
      </section>
    </main>
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
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const clearDocs = useDocStore((state) => state.clearDocs);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (clerkEnabled || !hydrated || !token) return;
    api.get("/auth/me").catch(() => {
      if (!refreshToken) {
        clearSession();
        clearDocs();
        return;
      }

      api
        .post<SessionResponse>("/auth/refresh", { refreshToken })
        .then((response) => {
          setSession(response.data.token, response.data.user, response.data.refreshToken);
        })
        .catch(() => {
          clearSession();
          clearDocs();
        });
    });
  }, [hydrated, token, refreshToken, setSession, clearSession, clearDocs]);

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
        <Route path="/login" element={clerkEnabled ? <ClerkAuthForm key="login" mode="login" /> : <AuthScreen mode="login" />} />
        <Route path="/register" element={clerkEnabled ? <ClerkAuthForm key="register" mode="register" /> : <AuthScreen mode="register" />} />
        <Route path="/reset-password" element={clerkEnabled ? <ClerkAuthForm key="reset" mode="reset" /> : <ResetPasswordScreen />} />
        <Route path="/sso-callback" element={clerkEnabled ? <GoogleCallbackScreen /> : <Navigate to="/login" replace />} />
        <Route path="/auth/tasks" element={clerkEnabled ? <RedirectToTasks /> : <Navigate to="/login" replace />} />
        <Route path="/public/:token" element={<PublicDocumentPage />} />
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
          path="/integrations"
          element={<ProtectedRoute><IntegrationsPage /></ProtectedRoute>}
        />
        <Route
          path="/calendar"
          element={<ProtectedRoute><CalendarPage /></ProtectedRoute>}
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
      <BackendErrorModal />
    </Suspense>
  );
};

export default App;
