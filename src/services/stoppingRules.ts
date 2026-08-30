import { DEFAULT_STOPPING_RULES } from "@/models/SystemConfig";

export interface StoppingRulesConfig {
  max_retries: number;
  max_time_window_hours: number;
  max_nudges: number;
  min_retry_interval_minutes: number;
  max_daily_attempts: number;
  amount_ceiling_paise: number;
  quiet_hours: { start: number; end: number };
}

export interface RecoveryCaseState {
  retry_count: number;
  nudge_count: number;
  first_attempt_at: Date;
  last_attempt_at: Date | null;
  amount: number;
}

export interface StopResult {
  stop: boolean;
  reason: string | null;
}

export function shouldStop(
  caseState: RecoveryCaseState,
  config: StoppingRulesConfig = DEFAULT_STOPPING_RULES,
  now: Date = new Date()
): StopResult {
  if (caseState.retry_count >= config.max_retries) {
    return { stop: true, reason: "max_retries_exceeded" };
  }

  const ageMs = now.getTime() - caseState.first_attempt_at.getTime();
  const maxWindowMs = config.max_time_window_hours * 60 * 60 * 1000;
  if (ageMs >= maxWindowMs) {
    return { stop: true, reason: "time_window_expired" };
  }

  if (caseState.nudge_count >= config.max_nudges) {
    return { stop: true, reason: "nudge_limit_reached" };
  }

  if (isQuietHours(config.quiet_hours, now)) {
    return { stop: true, reason: "quiet_hours" };
  }

  if (caseState.amount > config.amount_ceiling_paise) {
    return { stop: true, reason: "amount_requires_manual_review" };
  }

  if (caseState.last_attempt_at) {
    const timeSinceLastMs = now.getTime() - caseState.last_attempt_at.getTime();
    const minIntervalMs = config.min_retry_interval_minutes * 60 * 1000;
    if (timeSinceLastMs < minIntervalMs) {
      return { stop: true, reason: "min_retry_interval_not_met" };
    }
  }

  return { stop: false, reason: null };
}

export function isQuietHours(
  quietHours: { start: number; end: number },
  now: Date = new Date()
): boolean {
  const hour = now.getHours();
  if (quietHours.start > quietHours.end) {
    // Wraps midnight: e.g., 22-8 means 22:00 to 08:00
    return hour >= quietHours.start || hour < quietHours.end;
  }
  return hour >= quietHours.start && hour < quietHours.end;
}

export function formatStoppingState(
  caseState: RecoveryCaseState,
  config: StoppingRulesConfig = DEFAULT_STOPPING_RULES
): Record<string, string> {
  const ageMs = new Date().getTime() - caseState.first_attempt_at.getTime();
  const ageHours = Math.round(ageMs / (60 * 60 * 1000) * 10) / 10;

  return {
    retries: `${caseState.retry_count}/${config.max_retries}`,
    time_window: `${ageHours}hr/${config.max_time_window_hours}hr`,
    nudges: `${caseState.nudge_count}/${config.max_nudges}`,
  };
}
