import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redisConnection: IORedis | null = null;

function getRedisConnection(): IORedis {
  if (!redisConnection) {
    redisConnection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
  return redisConnection;
}

export function getRecoveryQueue(): Queue | null {
  try {
    return new Queue("recovery", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  } catch {
    return null;
  }
}

export function createRecoveryWorker(
  processor: (job: any) => Promise<any>
): Worker | null {
  try {
    return new Worker("recovery", processor, {
      connection: getRedisConnection(),
      concurrency: 5,
    });
  } catch {
    return null;
  }
}

export { redisConnection };
