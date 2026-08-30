import mongoose, { Schema, Document } from "mongoose";

export interface IAuditLog extends Document {
  audit_id: string;
  recovery_case_id: string;
  batch_id: string | null;
  timestamp: Date;
  stage: "intake" | "diagnosis" | "stopping_check" | "intervention_selection" | "execution" | "outcome";
  decision: string;
  reasoning: string;
  confidence?: number;
  ai_used: boolean;
  llm_model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  latency_ms?: number;
  context?: Record<string, any>;
}

const AuditLogSchema = new Schema<IAuditLog>({
  audit_id: { type: String, required: true, unique: true },
  recovery_case_id: { type: String, required: true },
  batch_id: { type: String, default: null },
  timestamp: { type: Date, required: true, default: Date.now },
  stage: {
    type: String,
    enum: ["intake", "diagnosis", "stopping_check", "intervention_selection", "execution", "outcome"],
    required: true,
  },
  decision: { type: String, required: true },
  reasoning: { type: String, required: true },
  confidence: Number,
  ai_used: { type: Boolean, required: true },
  llm_model: String,
  prompt_tokens: Number,
  completion_tokens: Number,
  latency_ms: Number,
  context: Schema.Types.Mixed,
});

AuditLogSchema.index({ recovery_case_id: 1, timestamp: 1 });
AuditLogSchema.index({ batch_id: 1 });
AuditLogSchema.index({ stage: 1, timestamp: -1 });
AuditLogSchema.index({ ai_used: 1 });

export const AuditLog =
  mongoose.models.AuditLog ||
  mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
