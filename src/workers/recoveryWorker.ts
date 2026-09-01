import { Job } from "bullmq";
import { connectDB } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { processRecoveryEvent, executeDelayedRetry, PaymentFailureEvent } from "@/services/orchestrator";

export interface RecoveryJobData {
  event: PaymentFailureEvent;
  batchId: string | null;
}

export interface DelayedRetryJobData {
  caseId: string;
}

export async function processRecoveryJob(job: Job<RecoveryJobData | DelayedRetryJobData>) {
  if (job.name === "delayed_retry") {
    const { caseId } = job.data as DelayedRetryJobData;
    const result = await executeDelayedRetry(caseId);
    return {
      case_id: caseId,
      status: result?.status ?? "not_found",
      outcome: result?.outcome?.result ?? "unknown",
    };
  }

  const { event, batchId } = job.data as RecoveryJobData;
  const result = await processRecoveryEvent(event, batchId);

  if (batchId) {
    await updateBatchProgress(batchId, result.outcome.result);
  }

  return {
    case_id: result.case_id,
    status: result.status,
    outcome: result.outcome.result,
  };
}

async function updateBatchProgress(
  batchId: string,
  outcome: string
) {
  await connectDB();

  const field =
    outcome === "recovered"
      ? "results.recovered"
      : outcome === "stopped"
        ? "results.stopped"
        : "results.failed";

  const batch = await Batch.findOneAndUpdate(
    { batch_id: batchId },
    {
      $inc: { [field]: 1, "results.pending": -1 },
    },
    { new: true }
  );

  if (!batch) return;

  if (batch.results.pending <= 0) {
    const { recovered, stopped, failed } = batch.results;
    const total = recovered + stopped + failed;
    await Batch.findOneAndUpdate(
      { batch_id: batchId },
      {
        status: "completed",
        recovery_rate: total > 0 ? recovered / total : 0,
        completed_at: new Date(),
        processing_time_ms: new Date().getTime() - batch.started_at.getTime(),
      }
    );
  }
}
