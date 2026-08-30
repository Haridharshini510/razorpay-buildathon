import { createRecoveryWorker } from "@/lib/redis";
import { processRecoveryJob } from "./recoveryWorker";

const worker = createRecoveryWorker(processRecoveryJob);

if (worker) {
  worker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} completed: ${job.returnvalue?.status}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] Job ${job?.id} failed:`, err.message);
  });

  console.log("[worker] Recovery worker started, listening for jobs...");
} else {
  console.error("[worker] Failed to start worker — check Redis connection");
}
