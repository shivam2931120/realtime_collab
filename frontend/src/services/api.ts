import axios from "axios";
import { getRequestToken } from "./auth";
import { API_BASE_URL } from "./config";
import { reportBackendError } from "./backendErrors";

export { API_BASE_URL };

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  const token = await getRequestToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    reportBackendError(error, error.config?.url);
    return Promise.reject(error);
  },
);

export default api;
