export type SessionUser = {
  id: string;
  email: string;
};

type SessionPayload = {
  token: string;
  refreshToken?: string;
  user: SessionUser;
};

const STORAGE_KEY = "editorial.session";
export const clerkEnabled = import.meta.env.VITE_AUTH_PROVIDER === "clerk" && Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
let clerkGetToken: (() => Promise<string | null>) | null = null;
let clerkSignOut: (() => Promise<void>) | null = null;

export const setClerkAuth = (getToken: (() => Promise<string | null>) | null, signOut: (() => Promise<void>) | null) => {
  clerkGetToken = getToken;
  clerkSignOut = signOut;
};

export const getRequestToken = async () => clerkEnabled ? clerkGetToken?.() ?? null : getAuthToken();
export const signOutClerk = async () => { await clerkSignOut?.(); };

const safeParse = (value: string | null): SessionPayload | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as SessionPayload;
    if (!parsed?.token || !parsed?.user?.id || !parsed?.user?.email) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const getStoredSession = () => safeParse(localStorage.getItem(STORAGE_KEY));

export const getAuthToken = () => getStoredSession()?.token || null;
export const getRefreshToken = () => getStoredSession()?.refreshToken || null;

export const saveSession = (payload: SessionPayload) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

export const clearSession = () => {
  localStorage.removeItem(STORAGE_KEY);
};
