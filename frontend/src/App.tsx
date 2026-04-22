import { ReactNode, Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SignIn, SignUp, useAuth } from "@clerk/clerk-react";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const DraftsPage = lazy(() => import("./pages/Drafts"));
const CollectionsPage = lazy(() => import("./pages/Collections"));
const TeamsPage = lazy(() => import("./pages/Teams"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const EditorPage = lazy(() => import("./pages/Editor"));
const DiscoverPage = lazy(() => import("./pages/Discover"));
const LibraryPage = lazy(() => import("./pages/Library"));
const AnalyticsPage = lazy(() => import("./pages/Analytics"));

const ClerkProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div>Loading...</div>;
  if (!isSignedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App = () => {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Loading Auth...
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
      <Routes>
        <Route path="/" element={<Navigate to={isSignedIn ? "/dashboard" : "/login"} replace />} />
        
        <Route path="/login/*" element={
          <div className="flex min-h-screen items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black px-4">
            <SignIn routing="path" path="/login" signUpUrl="/register" fallbackRedirectUrl="/dashboard" />
          </div>
        } />
        
        <Route path="/register/*" element={
          <div className="flex min-h-screen items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black px-4">
            <SignUp routing="path" path="/register" signInUrl="/login" fallbackRedirectUrl="/dashboard" />
          </div>
        } />
        
        <Route
          path="/dashboard"
          element={
            <ClerkProtectedRoute>
              <Dashboard />
            </ClerkProtectedRoute>
          }
        />
        <Route
          path="/drafts"
          element={
            <ClerkProtectedRoute>
              <DraftsPage />
            </ClerkProtectedRoute>
          }
        />
        <Route
          path="/collections"
          element={
            <ClerkProtectedRoute>
              <CollectionsPage />
            </ClerkProtectedRoute>
          }
        />
        <Route
          path="/teams"
          element={
            <ClerkProtectedRoute>
              <TeamsPage />
            </ClerkProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ClerkProtectedRoute>
              <SettingsPage />
            </ClerkProtectedRoute>
          }
        />
          <Route
            path="/discover"
            element={
              <ClerkProtectedRoute>
                <DiscoverPage />
              </ClerkProtectedRoute>
            }
          />
          <Route
            path="/library"
            element={
              <ClerkProtectedRoute>
                <LibraryPage />
              </ClerkProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ClerkProtectedRoute>
                <AnalyticsPage />
              </ClerkProtectedRoute>
            }
          />
        <Route
          path="/editor/:id"
          element={
            <ClerkProtectedRoute>
              <EditorPage />
            </ClerkProtectedRoute>
          }
        />
        <Route
          path="/docs/:id"
          element={
            <ClerkProtectedRoute>
              <EditorPage />
            </ClerkProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
};

export default App;
