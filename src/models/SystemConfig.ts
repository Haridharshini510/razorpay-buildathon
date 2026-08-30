import mongoose, { Schema, Document } from "mongoose";

export interface ISystemConfig extends Document {
  key: string;
  value: Record<string, any>;
  updated_at: Date;
}

const SystemConfigSchema = new Schema<ISystemConfig>({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
  updated_at: { type: Date, default: Date.now },
});

export const SystemConfig =
  mongoose.models.SystemConfig ||
  mongoose.model<ISystemConfig>("SystemConfig", SystemConfigSchema);

export const DEFAULT_STOPPING_RULES = {
  max_retries: 3,
  max_time_window_hours: 24,
  max_nudges: 2,
  min_retry_interval_minutes: 5,
  max_daily_attempts: 5,
  amount_ceiling_paise: 10000000, // ₹1,00,000
  quiet_hours: { start: 22, end: 8 },
};

export async function getStoppingRules() {
  const config = await SystemConfig.findOne({ key: "stopping_rules" });
  if (config) return config.value;
  return DEFAULT_STOPPING_RULES;
}

export async function seedSystemConfig() {
  const existing = await SystemConfig.findOne({ key: "stopping_rules" });
  if (!existing) {
    await SystemConfig.create({
      key: "stopping_rules",
      value: DEFAULT_STOPPING_RULES,
      updated_at: new Date(),
    });
  }
}
