import { describe, it, expect, vi, beforeEach } from "vitest";
import { InterventionResult } from "../src/services/interventionSelector";
import { IRecoveryCase } from "../src/models/RecoveryCase";

vi.mock("../src/lib/razorpay", () => ({
  getRazorpayClient: () => ({
    paymentLink: {
      create: vi.fn().mockResolvedValue({
        id: "plink_test_123",
        short_url: "https://rzp.io/test123",
        status: "created",
      }),
    },
  }),
}));

vi.mock("nanoid", () => ({
  nanoid: () => "abc123",
}));

import { executeIntervention } from "../src/services/executionEngine";

function makeIntervention(overrides: Partial<InterventionResult> = {}): InterventionResult {
  return {
    action: "payment_link",
    method: "upi",
    delay_minutes: 15,
    reasoning: "Test intervention",
    model_used: "test",
    fallback_used: true,
    ...overrides,
  };
}

function makeRecoveryCase(overrides: Partial<any> = {}): IRecoveryCase {
  return {
    case_id: "rec_test123",
    diagnosis: {
      root_cause: "bank_server_timeout",
      confidence: 0.8,
      reasoning: "Test",
      recoverable: true,
      diagnosed_at: new Date(),
      model_used: "test",
      fallback_used: true,
    },
    original_event: {
      payment_id: "pay_test",
      order_id: "order_test",
      amount: 500000,
      currency: "INR",
      method: "upi",
      error_code: "GATEWAY_ERROR",
      error_description: "Bank server timeout",
      customer: { email: "test@test.com", phone: "9800000000", name: "Test User" },
      occurred_at: new Date(),
    },
    ...overrides,
  } as unknown as IRecoveryCase;
}

describe("executeIntervention", () => {
  it("creates a payment link for payment_link action", async () => {
    const result = await executeIntervention(makeIntervention({ action: "payment_link" }), makeRecoveryCase());
    expect(result.success).toBe(true);
    expect(result.payment_link).toBe("https://rzp.io/test123");
    expect(result.new_payment_id).toBe("plink_test_123");
    expect(result.detail).toContain("Payment link created");
  });

  it("creates a payment link for customer_nudge action", async () => {
    const result = await executeIntervention(makeIntervention({ action: "customer_nudge" }), makeRecoveryCase());
    expect(result.success).toBe(true);
    expect(result.payment_link).toBeDefined();
  });

  it("creates a payment link for alternate_method action", async () => {
    const result = await executeIntervention(
      makeIntervention({ action: "alternate_method", method: "card" }),
      makeRecoveryCase()
    );
    expect(result.success).toBe(true);
    expect(result.detail).toContain("alternate_method");
  });

  it("creates a payment link for immediate_retry action", async () => {
    const result = await executeIntervention(makeIntervention({ action: "immediate_retry" }), makeRecoveryCase());
    expect(result.success).toBe(true);
    expect(result.payment_link).toBeDefined();
  });

  it("creates a payment link for delayed_retry action", async () => {
    const result = await executeIntervention(makeIntervention({ action: "delayed_retry" }), makeRecoveryCase());
    expect(result.success).toBe(true);
    expect(result.payment_link).toBeDefined();
  });

  it("returns failure for stop action", async () => {
    const result = await executeIntervention(makeIntervention({ action: "stop" }), makeRecoveryCase());
    expect(result.success).toBe(false);
    expect(result.detail).toContain("stop");
  });

  it("includes razorpay_response on success", async () => {
    const result = await executeIntervention(makeIntervention({ action: "payment_link" }), makeRecoveryCase());
    expect(result.razorpay_response).toBeDefined();
    expect(result.razorpay_response.id).toBe("plink_test_123");
    expect(result.razorpay_response.short_url).toBe("https://rzp.io/test123");
  });
});
