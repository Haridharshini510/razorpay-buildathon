import mongoose, { Schema, Document } from "mongoose";

export interface IBatch extends Document {
  batch_id: string;
  total_events: number;
  distribution: Record<string, number>;
  status: "processing" | "completed" | "failed";
  results: {
    recovered: number;
    stopped: number;
    failed: number;
    pending: number;
  };
  recovery_rate: number;
  total_amount_processed: number;
  total_amount_recovered: number;
  started_at: Date;
  completed_at: Date | null;
  processing_time_ms: number | null;
}

const BatchSchema = new Schema<IBatch>({
  batch_id: { type: String, required: true, unique: true },
  total_events: { type: Number, required: true },
  distribution: { type: Schema.Types.Mixed, default: {} },
  status: {
    type: String,
    enum: ["processing", "completed", "failed"],
    default: "processing",
  },
  results: {
    recovered: { type: Number, default: 0 },
    stopped: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
  },
  recovery_rate: { type: Number, default: 0 },
  total_amount_processed: { type: Number, default: 0 },
  total_amount_recovered: { type: Number, default: 0 },
  started_at: { type: Date, default: Date.now },
  completed_at: { type: Date, default: null },
  processing_time_ms: { type: Number, default: null },
});

BatchSchema.index({ status: 1, started_at: -1 });

export const Batch =
  mongoose.models.Batch || mongoose.model<IBatch>("Batch", BatchSchema);
