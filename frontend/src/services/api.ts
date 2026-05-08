import axios from "axios";
import { isAuthDisabled } from "../utils/auth";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  if (isAuthDisabled) {
    return config;
  }

  const clerk = (window as any).Clerk;

  if (clerk && clerk.session) {
    try {
      const token = await clerk.session.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn("Failed to get Clerk token", err);
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  },
);

export default api;
