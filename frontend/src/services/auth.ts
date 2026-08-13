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
