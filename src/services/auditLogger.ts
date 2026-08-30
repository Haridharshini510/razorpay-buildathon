import { nanoid } from "nanoid";
import { connectDB } from "@/lib/db";
import { AuditLog } from "@/models/AuditLog";

export type AuditStage =
  | "intake"
  | "diagnosis"
  | "stopping_check"
  | "intervention_selection"
  | "execution"
  | "outcome";

export interface LogDecisionParams {
  recovery_case_id: string;
  batch_id?: string | null;
  stage: AuditStage;
  decision: string;
  reasoning: string;
  confidence?: number;
  ai_used: boolean;
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  latency_ms?: number;
  context?: Record<string, any>;
}

export async function logDecision(params: LogDecisionParams) {
  await connectDB();

  const entry = await AuditLog.create({
    audit_id: `aud_${nanoid(12)}`,
    recovery_case_id: params.recovery_case_id,
    batch_id: params.batch_id || null,
    timestamp: new Date(),
    stage: params.stage,
    decision: params.decision,
    reasoning: params.reasoning,
    confidence: params.confidence,
    ai_used: params.ai_used,
    llm_model: params.model,
    prompt_tokens: params.prompt_tokens,
    completion_tokens: params.completion_tokens,
    latency_ms: params.latency_ms,
    context: params.context,
  });

  return entry;
}
