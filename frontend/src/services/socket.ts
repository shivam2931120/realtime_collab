import { io, Socket } from "socket.io-client";
import { SOCKET_URL } from "./config";
import { reportSocketBackendError } from "./backendErrors";

let socket: Socket | null = null;

export const connectSocket = (token: string) => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: {
        token,
      },
    });
    socket.on("connect_error", (error) => reportSocketBackendError(error?.message));
    return socket;
  }

  socket.auth = { token };
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (!socket) {
    return;
  }

  socket.disconnect();
  socket = null;
};
