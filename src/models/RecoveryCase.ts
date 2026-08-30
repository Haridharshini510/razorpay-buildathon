import mongoose, { Schema, Document } from "mongoose";

export interface IIntervention {
  attempt: number;
  action: string;
  method: string;
  delay_minutes?: number;
  reasoning: string;
  scheduled_at: Date;
  executed_at?: Date;
  result: "success" | "failed" | "pending";
  result_detail?: string;
  recovered_amount?: number;
  new_payment_id?: string;
}

export interface IRecoveryCase extends Document {
  case_id: string;
  batch_id: string | null;
  type: "payment_failure";
  status: "received" | "diagnosing" | "intervening" | "waiting_retry" | "resolved" | "stopped" | "failed";
  original_event: {
    payment_id: string;
    order_id: string;
    amount: number;
    currency: string;
    method: string;
    error_code: string;
    error_description: string;
    customer: {
      email: string;
      phone: string;
      name?: string;
    };
    occurred_at: Date;
  };
  diagnosis: {
    root_cause: string;
    confidence: number;
    reasoning: string;
    recoverable: boolean;
    suggested_wait_minutes?: number;
    diagnosed_at: Date;
    model_used: string;
    fallback_used: boolean;
  } | null;
  interventions: IIntervention[];
  stopping_state: {
    retry_count: number;
    nudge_count: number;
    first_attempt_at: Date;
    last_attempt_at: Date | null;
    stopped: boolean;
    stop_reason: string | null;
  };
  outcome: {
    result: "recovered" | "stopped" | "failed" | "pending";
    recovered_amount?: number;
    time_to_recovery_ms?: number;
    total_attempts: number;
    final_method?: string;
  };
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
}

const InterventionSchema = new Schema<IIntervention>(
  {
    attempt: { type: Number, required: true },
    action: { type: String, required: true },
    method: { type: String, required: true },
    delay_minutes: Number,
    reasoning: { type: String, required: true },
    scheduled_at: { type: Date, required: true },
    executed_at: Date,
    result: { type: String, enum: ["success", "failed", "pending"], default: "pending" },
    result_detail: String,
    recovered_amount: Number,
    new_payment_id: String,
  },
  { _id: false }
);

const RecoveryCaseSchema = new Schema<IRecoveryCase>(
  {
    case_id: { type: String, required: true, unique: true },
    batch_id: { type: String, default: null },
    type: { type: String, enum: ["payment_failure"], default: "payment_failure" },
    status: {
      type: String,
      enum: ["received", "diagnosing", "intervening", "waiting_retry", "resolved", "stopped", "failed"],
      default: "received",
    },
    original_event: {
      payment_id: { type: String, required: true },
      order_id: { type: String, required: true },
      amount: { type: Number, required: true },
      currency: { type: String, default: "INR" },
      method: { type: String, required: true },
      error_code: { type: String, required: true },
      error_description: { type: String, required: true },
      customer: {
        email: String,
        phone: String,
        name: String,
      },
      occurred_at: { type: Date, required: true },
    },
    diagnosis: {
      type: Schema.Types.Mixed,
      default: null,
    },
    interventions: [InterventionSchema],
    stopping_state: {
      retry_count: { type: Number, default: 0 },
      nudge_count: { type: Number, default: 0 },
      first_attempt_at: { type: Date, required: true },
      last_attempt_at: { type: Date, default: null },
      stopped: { type: Boolean, default: false },
      stop_reason: { type: String, default: null },
    },
    outcome: {
      result: { type: String, enum: ["recovered", "stopped", "failed", "pending"], default: "pending" },
      recovered_amount: Number,
      time_to_recovery_ms: Number,
      total_attempts: { type: Number, default: 0 },
      final_method: String,
    },
    resolved_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

RecoveryCaseSchema.index({ batch_id: 1, status: 1 });
RecoveryCaseSchema.index({ status: 1, type: 1 });
RecoveryCaseSchema.index({ "original_event.occurred_at": -1 });
RecoveryCaseSchema.index({ "diagnosis.root_cause": 1 });

export const RecoveryCase =
  mongoose.models.RecoveryCase ||
  mongoose.model<IRecoveryCase>("RecoveryCase", RecoveryCaseSchema);
