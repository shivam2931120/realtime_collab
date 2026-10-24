import { useAuth, useClerk } from "@clerk/react";
import { ReactNode, useEffect, useState } from "react";
import { API_BASE_URL } from "../services/config";
import { setClerkAuth } from "../services/auth";
import { useAuthStore } from "../store/authStore";
import { useDocStore } from "../store/docStore";
import { disconnectSocket } from "../services/socket";

export default function ClerkSessionBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { signOut } = useClerk();
  const setClerkSession = useAuthStore((state) => state.setClerkSession);
  const clearDocs = useDocStore((state) => state.clearDocs);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setClerkAuth(getToken, () => signOut());
    return () => setClerkAuth(null, null);
  }, [getToken, signOut]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      disconnectSocket();
      setClerkSession(null);
      clearDocs();
      setReady(true);
      setError("");
      return;
    }

    let active = true;
    setReady(false);
    setError("");
    const loadUser = async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Clerk session token is unavailable.");
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("The API could not verify your Clerk session. Check the Clerk server configuration.");
        const payload = await response.json() as { user: { id: string; email: string } };
        if (!active) return;
        setClerkSession(payload.user);
        setReady(true);
      } catch (cause) {
        if (!active) return;
        setClerkSession(null);
        setError(cause instanceof Error ? cause.message : "Could not load your account.");
      }
    };
    void loadUser();
    return () => { active = false; };
  }, [isLoaded, isSignedIn, userId, getToken, setClerkSession, clearDocs]);

  if (error) return <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-sm text-red-300">{error}</div>;
  if (!isLoaded || !ready) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-on-surface-variant">Loading session...</div>;
  return <>{children}</>;
}
