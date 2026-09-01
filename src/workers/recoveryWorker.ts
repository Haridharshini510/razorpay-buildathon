import { Job } from "bullmq";
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
  return {
    case_id: result.case_id,
    status: result.status,
    outcome: result.outcome.result,
  };
}
