import { Job } from "bullmq";
import { processRecoveryEvent, PaymentFailureEvent } from "@/services/orchestrator";

export interface RecoveryJobData {
  event: PaymentFailureEvent;
  batchId: string | null;
}

export async function processRecoveryJob(job: Job<RecoveryJobData>) {
  const { event, batchId } = job.data;
  const result = await processRecoveryEvent(event, batchId);
  return {
    case_id: result.case_id,
    status: result.status,
    outcome: result.outcome.result,
  };
}
