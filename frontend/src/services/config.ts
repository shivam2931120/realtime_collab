const trimTrailingSlash = (value: string) => value.trim().replace(/\/+$/, "");

const withApiPath = (value: string) => {
  const normalized = trimTrailingSlash(value);
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
};

const withoutApiPath = (value: string) => trimTrailingSlash(value).replace(/\/api$/, "");

const configuredBackendUrl = import.meta.env.VITE_BACKEND_URL
  ? withoutApiPath(import.meta.env.VITE_BACKEND_URL)
  : "";

const configuredApiUrl = import.meta.env.VITE_API_URL
  ? withApiPath(import.meta.env.VITE_API_URL)
  : "";

export const BACKEND_URL =
  configuredBackendUrl || (configuredApiUrl ? withoutApiPath(configuredApiUrl) : "http://localhost:5000");

export const API_BASE_URL = configuredApiUrl || `${BACKEND_URL}/api`;

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
  ? trimTrailingSlash(import.meta.env.VITE_SOCKET_URL)
  : BACKEND_URL;
