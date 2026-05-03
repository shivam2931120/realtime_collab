import Redis from "ioredis";

let redisClient: Redis | null = null;
let redisPub: Redis | null = null;
let loggedClientError = false;
let loggedPubError = false;

const getRedisUrl = () => process.env.REDIS_URL || "";

export const isRedisEnabled = () => {
  const url = getRedisUrl();
  if (!url) return false;
  // Avoid trying to connect to localhost Redis when running in production/PaaS
  // where localhost:6379 is unavailable. Allow localhost for local dev only.
  if (process.env.NODE_ENV === "production") {
    const localhostPatterns = ["localhost", "127.0.0.1", "::1"];
    for (const p of localhostPatterns) {
      if (url.includes(p)) return false;
    }
  }
  return true;
};

export const initRedis = async () => {
  if (!isRedisEnabled()) {
    return;
  }

  if (redisClient && redisPub) {
    return;
  }

  const redisUrl = getRedisUrl();

  try {
    redisClient = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redisPub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });

    redisClient.on("error", (error) => {
      if (!loggedClientError) {
        console.error("Redis client error; running without cache", error);
        loggedClientError = true;
      }
    });
    redisPub.on("error", (error) => {
      if (!loggedPubError) {
        console.error("Redis pubsub error; running without pubsub", error);
        loggedPubError = true;
      }
    });

    await Promise.all([redisClient.connect(), redisPub.connect()]);
    console.log("Redis connected");
  } catch (error) {
    console.error("Redis init failed; running without cache/pubsub", error);
    if (redisClient) {
      redisClient.disconnect();
      redisClient = null;
    }
    if (redisPub) {
      redisPub.disconnect();
      redisPub = null;
    }
  }
};

export const getCache = async <T>(key: string): Promise<T | null> => {
  if (!redisClient) {
    return null;
  }

  try {
    const raw = await redisClient.get(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch (error) {
    return null;
  }
};

export const setCache = async (key: string, value: unknown, ttlSeconds = 60) => {
  if (!redisClient) {
    return;
  }

  try {
    await redisClient.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    console.error("Redis set cache failed", error);
  }
};

export const invalidateCachePrefix = async (prefix: string) => {
  if (!redisClient) {
    return;
  }

  try {
    const keys = await redisClient.keys(`${prefix}*`);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  } catch (error) {
    console.error("Redis invalidate failed", error);
  }
};

export const publishEvent = async (channel: string, payload: unknown) => {
  if (!redisPub) {
    return;
  }

  try {
    await redisPub.publish(channel, JSON.stringify(payload));
  } catch (error) {
    console.error("Redis publish failed", error);
  }
};
