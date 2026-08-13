import axios from "axios";
import { useUiStore } from "../store/uiStore";

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return String(error.response?.data?.message || error.message || "The backend could not complete this request.");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The backend could not complete this request.";
};

export const reportBackendError = (error: unknown, path?: string) => {
  const status = axios.isAxiosError(error) ? error.response?.status || null : null;
  const isBackendFailure = !axios.isAxiosError(error) || !error.response || status === 404 || (status !== null && status >= 500);

  if (!isBackendFailure) {
    return;
  }

  useUiStore.getState().setBackendError({
    status,
    message: getErrorMessage(error),
    path,
  });
};

export const reportSocketBackendError = (message?: string) => {
  useUiStore.getState().setBackendError({
    status: null,
    message: message || "The realtime backend is unavailable.",
  });
};
