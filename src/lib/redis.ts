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

let recoveryQueue: Queue | null = null;

export function getRecoveryQueue(): Queue | null {
  if (recoveryQueue) return recoveryQueue;
  try {
    recoveryQueue = new Queue("recovery", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
    return recoveryQueue;
  } catch {
    return null;
  }
}

export async function enqueueDelayedRetry(
  caseId: string,
  delayMinutes: number
): Promise<boolean> {
  const queue = getRecoveryQueue();
  if (!queue) return false;
  try {
    await queue.add(
      "delayed_retry",
      { caseId },
      { delay: delayMinutes * 60 * 1000 }
    );
    return true;
  } catch {
    return false;
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
