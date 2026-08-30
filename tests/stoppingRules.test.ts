import { describe, it, expect } from "vitest";
import { shouldStop, isQuietHours, StoppingRulesConfig, RecoveryCaseState } from "../src/services/stoppingRules";

const DEFAULT_CONFIG: StoppingRulesConfig = {
  max_retries: 3,
  max_time_window_hours: 24,
  max_nudges: 2,
  min_retry_interval_minutes: 5,
  max_daily_attempts: 5,
  amount_ceiling_paise: 10000000,
  quiet_hours: { start: 22, end: 8 },
};

function makeCase(overrides: Partial<RecoveryCaseState> = {}): RecoveryCaseState {
  return {
    retry_count: 0,
    nudge_count: 0,
    first_attempt_at: new Date(),
    last_attempt_at: null,
    amount: 500000, // ₹5,000
    ...overrides,
  };
}

describe("shouldStop", () => {
  it("returns stop: false when all rules pass", () => {
    const now = new Date("2026-08-29T14:00:00Z"); // 2pm, not quiet hours
    const result = shouldStop(makeCase({ first_attempt_at: now }), DEFAULT_CONFIG, now);
    expect(result.stop).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("stops when max_retries exceeded", () => {
    const result = shouldStop(
      makeCase({ retry_count: 3 }),
      DEFAULT_CONFIG,
      new Date("2026-08-29T14:00:00Z")
    );
    expect(result.stop).toBe(true);
    expect(result.reason).toBe("max_retries_exceeded");
  });

  it("stops at exactly max_retries (boundary)", () => {
    const result = shouldStop(
      makeCase({ retry_count: 3 }),
      DEFAULT_CONFIG,
      new Date("2026-08-29T14:00:00Z")
    );
    expect(result.stop).toBe(true);
  });

  it("does not stop one below max_retries", () => {
    const result = shouldStop(
      makeCase({ retry_count: 2 }),
      DEFAULT_CONFIG,
      new Date("2026-08-29T14:00:00Z")
    );
    expect(result.stop).toBe(false);
  });

  it("stops when time window expired", () => {
    const firstAttempt = new Date("2026-08-28T10:00:00Z");
    const now = new Date("2026-08-29T11:00:00Z"); // 25 hours later
    const result = shouldStop(makeCase({ first_attempt_at: firstAttempt }), DEFAULT_CONFIG, now);
    expect(result.stop).toBe(true);
    expect(result.reason).toBe("time_window_expired");
  });

  it("does not stop when still within time window", () => {
    const firstAttempt = new Date("2026-08-29T10:00:00Z");
    const now = new Date("2026-08-29T14:00:00Z"); // 4 hours later
    const result = shouldStop(makeCase({ first_attempt_at: firstAttempt }), DEFAULT_CONFIG, now);
    expect(result.stop).toBe(false);
  });

  it("stops when nudge limit reached", () => {
    const result = shouldStop(
      makeCase({ nudge_count: 2 }),
      DEFAULT_CONFIG,
      new Date("2026-08-29T14:00:00Z")
    );
    expect(result.stop).toBe(true);
    expect(result.reason).toBe("nudge_limit_reached");
  });

  it("stops during quiet hours (23:00)", () => {
    const now = new Date("2026-08-29T23:00:00+05:30"); // 11pm IST
    // Create a date where getHours() returns 23
    const quietNow = new Date(2026, 7, 29, 23, 0, 0);
    const result = shouldStop(makeCase({ first_attempt_at: quietNow }), DEFAULT_CONFIG, quietNow);
    expect(result.stop).toBe(true);
    expect(result.reason).toBe("quiet_hours");
  });

  it("does not stop outside quiet hours (14:00)", () => {
    const now = new Date(2026, 7, 29, 14, 0, 0);
    const result = shouldStop(makeCase({ first_attempt_at: now }), DEFAULT_CONFIG, now);
    expect(result.stop).toBe(false);
  });

  it("stops when amount exceeds ceiling", () => {
    const result = shouldStop(
      makeCase({ amount: 15000000 }), // ₹1.5L > ₹1L ceiling
      DEFAULT_CONFIG,
      new Date(2026, 7, 29, 14, 0, 0)
    );
    expect(result.stop).toBe(true);
    expect(result.reason).toBe("amount_requires_manual_review");
  });

  it("does not stop when amount is below ceiling", () => {
    const result = shouldStop(
      makeCase({ amount: 5000000 }), // ₹50K < ₹1L ceiling
      DEFAULT_CONFIG,
      new Date(2026, 7, 29, 14, 0, 0)
    );
    expect(result.stop).toBe(false);
  });

  it("stops when min retry interval not met", () => {
    const lastAttempt = new Date(2026, 7, 29, 14, 0, 0);
    const now = new Date(2026, 7, 29, 14, 3, 0); // 3 min later (< 5 min interval)
    const result = shouldStop(
      makeCase({ last_attempt_at: lastAttempt, first_attempt_at: lastAttempt }),
      DEFAULT_CONFIG,
      now
    );
    expect(result.stop).toBe(true);
    expect(result.reason).toBe("min_retry_interval_not_met");
  });

  it("does not stop when min retry interval is met", () => {
    const lastAttempt = new Date(2026, 7, 29, 14, 0, 0);
    const now = new Date(2026, 7, 29, 14, 6, 0); // 6 min later (> 5 min interval)
    const result = shouldStop(
      makeCase({ last_attempt_at: lastAttempt, first_attempt_at: lastAttempt }),
      DEFAULT_CONFIG,
      now
    );
    expect(result.stop).toBe(false);
  });

  it("checks rules in priority order — max_retries first", () => {
    // Both max_retries AND quiet hours violated, but max_retries should be the reason
    const now = new Date(2026, 7, 29, 23, 0, 0);
    const result = shouldStop(makeCase({ retry_count: 3, first_attempt_at: now }), DEFAULT_CONFIG, now);
    expect(result.stop).toBe(true);
    expect(result.reason).toBe("max_retries_exceeded");
  });
});

describe("isQuietHours", () => {
  it("returns true at 22:00 (start of quiet)", () => {
    const now = new Date(2026, 7, 29, 22, 0, 0);
    expect(isQuietHours({ start: 22, end: 8 }, now)).toBe(true);
  });

  it("returns true at 03:00 (middle of quiet)", () => {
    const now = new Date(2026, 7, 29, 3, 0, 0);
    expect(isQuietHours({ start: 22, end: 8 }, now)).toBe(true);
  });

  it("returns true at 07:59 (just before end)", () => {
    const now = new Date(2026, 7, 29, 7, 59, 0);
    expect(isQuietHours({ start: 22, end: 8 }, now)).toBe(true);
  });

  it("returns false at 08:00 (end of quiet)", () => {
    const now = new Date(2026, 7, 29, 8, 0, 0);
    expect(isQuietHours({ start: 22, end: 8 }, now)).toBe(false);
  });

  it("returns false at 14:00 (middle of day)", () => {
    const now = new Date(2026, 7, 29, 14, 0, 0);
    expect(isQuietHours({ start: 22, end: 8 }, now)).toBe(false);
  });

  it("returns false at 21:59 (just before start)", () => {
    const now = new Date(2026, 7, 29, 21, 59, 0);
    expect(isQuietHours({ start: 22, end: 8 }, now)).toBe(false);
  });
});
