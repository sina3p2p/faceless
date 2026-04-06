import IORedis from "ioredis";
import { REDIS, APP } from "@/lib/constants";

const globalForRedis = globalThis as unknown as { redis: IORedis };

export const redis =
  globalForRedis.redis ??
  new IORedis(REDIS.url, {
    maxRetriesPerRequest: null,
  });

if (!APP.isProduction) globalForRedis.redis = redis;
