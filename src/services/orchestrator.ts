import { nanoid } from "nanoid";
import { connectDB } from "@/lib/db";
import { RecoveryCase, IRecoveryCase } from "@/models/RecoveryCase";
import { shouldStop, formatStoppingState, RecoveryCaseState } from "./stoppingRules";
import { logDecision } from "./auditLogger";
import { diagnose } from "./diagnosticEngine";
import { selectIntervention } from "./interventionSelector";
import { executeIntervention } from "./executionEngine";
import { DEFAULT_STOPPING_RULES } from "@/models/SystemConfig";

export interface PaymentFailureEvent {
  payment_id: string;
  order_id: string;
  amount: number;
  currency?: string;
  method: string;
  error_code: string;
  error_description: string;
  customer: {
    email: string;
    phone: string;
    name?: string;
  };
  timestamp: string;
}

export async function processRecoveryEvent(
  event: PaymentFailureEvent,
  batchId: string | null = null
): Promise<IRecoveryCase> {
  await connectDB();

  const caseId = `rec_${nanoid(12)}`;

  // 1. Create recovery case
  const recoveryCase = await RecoveryCase.create({
    case_id: caseId,
    batch_id: batchId,
    type: "payment_failure",
    status: "received",
    original_event: {
      payment_id: event.payment_id,
      order_id: event.order_id,
      amount: event.amount,
      currency: event.currency || "INR",
      method: event.method,
      error_code: event.error_code,
      error_description: event.error_description,
      customer: event.customer,
      occurred_at: new Date(event.timestamp),
    },
    stopping_state: {
      retry_count: 0,
      nudge_count: 0,
      first_attempt_at: new Date(),
      last_attempt_at: null,
      stopped: false,
      stop_reason: null,
    },
    outcome: {
      result: "pending",
      total_attempts: 0,
    },
    interventions: [],
  });

  // Log intake
  await logDecision({
    recovery_case_id: caseId,
    batch_id: batchId,
    stage: "intake",
    decision: "case_created",
    reasoning: `Payment failure received: ${event.error_code} on ${event.method} for ₹${(event.amount / 100).toFixed(2)}`,
    ai_used: false,
  });

  // 2. Run the recovery pipeline
  return await runPipeline(recoveryCase);
}

export async function runPipeline(recoveryCase: IRecoveryCase): Promise<IRecoveryCase> {
  const caseId = recoveryCase.case_id;
  const batchId = recoveryCase.batch_id;

  // --- DIAGNOSE ---
  recoveryCase.status = "diagnosing";
  await recoveryCase.save();

  const diagnosis = await diagnose({
    error_code: recoveryCase.original_event.error_code,
    error_description: recoveryCase.original_event.error_description,
    method: recoveryCase.original_event.method,
    amount: recoveryCase.original_event.amount,
    timestamp: recoveryCase.original_event.occurred_at.toISOString(),
  });

  recoveryCase.diagnosis = {
    ...diagnosis,
    diagnosed_at: new Date(),
  };
  await recoveryCase.save();

  await logDecision({
    recovery_case_id: caseId,
    batch_id: batchId,
    stage: "diagnosis",
    decision: diagnosis.root_cause,
    reasoning: diagnosis.reasoning,
    confidence: diagnosis.confidence,
    ai_used: !diagnosis.fallback_used,
    model: diagnosis.model_used,
    context: { recoverable: diagnosis.recoverable },
  });

  // If not recoverable, stop immediately
  if (!diagnosis.recoverable) {
    recoveryCase.status = "stopped";
    recoveryCase.stopping_state.stopped = true;
    recoveryCase.stopping_state.stop_reason = "not_recoverable";
    recoveryCase.outcome = {
      result: "stopped",
      total_attempts: 0,
    };
    recoveryCase.resolved_at = new Date();
    await recoveryCase.save();

    await logDecision({
      recovery_case_id: caseId,
      batch_id: batchId,
      stage: "outcome",
      decision: "stopped",
      reasoning: `Diagnosis indicates non-recoverable failure: ${diagnosis.root_cause}`,
      ai_used: false,
    });

    return recoveryCase;
  }

  // --- STOPPING RULES CHECK ---
  const caseState: RecoveryCaseState = {
    retry_count: recoveryCase.stopping_state.retry_count,
    nudge_count: recoveryCase.stopping_state.nudge_count,
    first_attempt_at: recoveryCase.stopping_state.first_attempt_at,
    last_attempt_at: recoveryCase.stopping_state.last_attempt_at,
    amount: recoveryCase.original_event.amount,
  };

  const stopResult = shouldStop(caseState, DEFAULT_STOPPING_RULES);

  await logDecision({
    recovery_case_id: caseId,
    batch_id: batchId,
    stage: "stopping_check",
    decision: stopResult.stop ? "stopped" : "proceed",
    reasoning: stopResult.stop
      ? `Stopping rule triggered: ${stopResult.reason}`
      : `All rules passed: ${JSON.stringify(formatStoppingState(caseState))}`,
    ai_used: false,
    context: formatStoppingState(caseState),
  });

  if (stopResult.stop) {
    recoveryCase.status = "stopped";
    recoveryCase.stopping_state.stopped = true;
    recoveryCase.stopping_state.stop_reason = stopResult.reason;
    recoveryCase.outcome = {
      result: "stopped",
      total_attempts: recoveryCase.stopping_state.retry_count,
    };
    recoveryCase.resolved_at = new Date();
    await recoveryCase.save();
    return recoveryCase;
  }

  // --- SELECT INTERVENTION ---
  recoveryCase.status = "intervening";
  await recoveryCase.save();

  const intervention = await selectIntervention(diagnosis, {
    amount: recoveryCase.original_event.amount,
    method: recoveryCase.original_event.method,
    attempt_number: recoveryCase.stopping_state.retry_count + 1,
    max_attempts: DEFAULT_STOPPING_RULES.max_retries,
  });

  await logDecision({
    recovery_case_id: caseId,
    batch_id: batchId,
    stage: "intervention_selection",
    decision: intervention.action,
    reasoning: intervention.reasoning,
    ai_used: !intervention.fallback_used,
    model: intervention.model_used,
    context: { method: intervention.method, delay_minutes: intervention.delay_minutes },
  });

  // --- EXECUTE ---
  const executionResult = await executeIntervention(intervention, recoveryCase);

  // Update intervention record
  const interventionRecord = {
    attempt: recoveryCase.stopping_state.retry_count + 1,
    action: intervention.action,
    method: intervention.method,
    delay_minutes: intervention.delay_minutes,
    reasoning: intervention.reasoning,
    scheduled_at: new Date(),
    executed_at: new Date(),
    result: executionResult.success ? ("success" as const) : ("failed" as const),
    result_detail: executionResult.detail,
    recovered_amount: executionResult.success ? recoveryCase.original_event.amount : undefined,
    new_payment_id: executionResult.new_payment_id,
  };

  recoveryCase.interventions.push(interventionRecord);
  recoveryCase.stopping_state.retry_count += 1;
  recoveryCase.stopping_state.last_attempt_at = new Date();

  if (intervention.action === "customer_nudge") {
    recoveryCase.stopping_state.nudge_count += 1;
  }

  await logDecision({
    recovery_case_id: caseId,
    batch_id: batchId,
    stage: "execution",
    decision: executionResult.success ? "recovered" : "execution_failed",
    reasoning: executionResult.detail,
    ai_used: false,
  });

  // --- DETERMINE OUTCOME ---
  if (executionResult.success) {
    recoveryCase.status = "resolved";
    recoveryCase.outcome = {
      result: "recovered",
      recovered_amount: recoveryCase.original_event.amount,
      time_to_recovery_ms: new Date().getTime() - recoveryCase.stopping_state.first_attempt_at.getTime(),
      total_attempts: recoveryCase.stopping_state.retry_count,
      final_method: intervention.method,
    };
    recoveryCase.resolved_at = new Date();

    await logDecision({
      recovery_case_id: caseId,
      batch_id: batchId,
      stage: "outcome",
      decision: "recovered",
      reasoning: `Payment recovered via ${intervention.action} (${intervention.method}) on attempt ${recoveryCase.stopping_state.retry_count}`,
      ai_used: false,
    });
  } else {
    // Check if we should try again or give up
    const newStopResult = shouldStop(
      { ...caseState, retry_count: recoveryCase.stopping_state.retry_count },
      DEFAULT_STOPPING_RULES
    );

    if (newStopResult.stop) {
      recoveryCase.status = "stopped";
      recoveryCase.stopping_state.stopped = true;
      recoveryCase.stopping_state.stop_reason = newStopResult.reason;
      recoveryCase.outcome = {
        result: "stopped",
        total_attempts: recoveryCase.stopping_state.retry_count,
      };
      recoveryCase.resolved_at = new Date();

      await logDecision({
        recovery_case_id: caseId,
        batch_id: batchId,
        stage: "outcome",
        decision: "stopped_after_failure",
        reasoning: `Intervention failed and stopping rule triggered: ${newStopResult.reason}`,
        ai_used: false,
      });
    } else {
      // Mark as failed for this attempt but still recoverable
      recoveryCase.status = "failed";
      recoveryCase.outcome = {
        result: "failed",
        total_attempts: recoveryCase.stopping_state.retry_count,
      };
      recoveryCase.resolved_at = new Date();

      await logDecision({
        recovery_case_id: caseId,
        batch_id: batchId,
        stage: "outcome",
        decision: "failed_attempt",
        reasoning: `Intervention ${intervention.action} failed: ${executionResult.detail}. Could retry but marking complete for batch processing.`,
        ai_used: false,
      });
    }
  }

  await recoveryCase.save();
  return recoveryCase;
}
