import dotenv from "dotenv";

dotenv.config();

import { createServer } from "./utils/server";
import { setupSockets } from "./sockets";
import { initRedis } from "./utils/redis";

const bootstrap = async () => {
  await initRedis();

  const { httpServer, io } = createServer();
  setupSockets(io);

  const port = Number(process.env.PORT || 5000);

  httpServer.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });
};

bootstrap().catch((error) => {
  console.error("Server bootstrap failed", error);
  process.exit(1);
});
