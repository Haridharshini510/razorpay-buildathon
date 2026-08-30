import { describe, it, expect, vi, beforeEach } from "vitest";
import { InterventionResult } from "../src/services/interventionSelector";
import { IRecoveryCase } from "../src/models/RecoveryCase";

const mockPaymentLinkCreate = vi.fn().mockResolvedValue({
  id: "plink_test_123",
  short_url: "https://rzp.io/test123",
  status: "created",
});

const mockOrderCreate = vi.fn().mockResolvedValue({
  id: "order_test_456",
  amount: 500000,
  currency: "INR",
  status: "created",
  receipt: "recovery_rec_test123_abc123",
});

vi.mock("../src/lib/razorpay", () => ({
  getRazorpayClient: () => ({
    paymentLink: { create: mockPaymentLinkCreate },
    orders: { create: mockOrderCreate },
  }),
}));

vi.mock("nanoid", () => ({
  nanoid: () => "abc123",
}));

import { executeIntervention, createOrder } from "../src/services/executionEngine";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a payment link for payment_link action", async () => {
    const result = await executeIntervention(makeIntervention({ action: "payment_link" }), makeRecoveryCase());
    expect(result.success).toBe(true);
    expect(result.payment_link).toBe("https://rzp.io/test123");
    expect(result.new_payment_id).toBe("plink_test_123");
    expect(result.detail).toContain("Payment link created");
    expect(mockPaymentLinkCreate).toHaveBeenCalledOnce();
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });

  it("creates order + payment link for immediate_retry", async () => {
    const result = await executeIntervention(makeIntervention({ action: "immediate_retry" }), makeRecoveryCase());
    expect(result.success).toBe(true);
    expect(result.order_id).toBe("order_test_456");
    expect(result.payment_link).toBe("https://rzp.io/test123");
    expect(result.detail).toContain("Retry initiated");
    expect(mockOrderCreate).toHaveBeenCalledOnce();
    expect(mockPaymentLinkCreate).toHaveBeenCalledOnce();
  });

  it("creates order + payment link for delayed_retry", async () => {
    const result = await executeIntervention(
      makeIntervention({ action: "delayed_retry", delay_minutes: 15 }),
      makeRecoveryCase()
    );
    expect(result.success).toBe(true);
    expect(result.order_id).toBe("order_test_456");
    expect(result.payment_link).toBe("https://rzp.io/test123");
    expect(result.detail).toContain("delayed_retry");
    expect(mockOrderCreate).toHaveBeenCalledOnce();
  });

  it("creates order + payment link for alternate_method with suggested method", async () => {
    const result = await executeIntervention(
      makeIntervention({ action: "alternate_method", method: "card" }),
      makeRecoveryCase()
    );
    expect(result.success).toBe(true);
    expect(result.order_id).toBe("order_test_456");
    expect(result.detail).toContain("Alternate method");
    expect(result.detail).toContain("card");
    expect(mockOrderCreate).toHaveBeenCalledOnce();
  });

  it("sends customer nudge with payment link", async () => {
    const result = await executeIntervention(makeIntervention({ action: "customer_nudge" }), makeRecoveryCase());
    expect(result.success).toBe(true);
    expect(result.payment_link).toBe("https://rzp.io/test123");
    expect(result.detail).toContain("Customer nudge");
    expect(mockPaymentLinkCreate).toHaveBeenCalledOnce();
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });

  it("returns failure for stop action", async () => {
    const result = await executeIntervention(makeIntervention({ action: "stop" }), makeRecoveryCase());
    expect(result.success).toBe(false);
    expect(result.detail).toContain("stop");
    expect(mockOrderCreate).not.toHaveBeenCalled();
    expect(mockPaymentLinkCreate).not.toHaveBeenCalled();
  });

  it("handles Razorpay API errors gracefully", async () => {
    mockPaymentLinkCreate.mockRejectedValueOnce({
      error: { description: "Invalid amount" },
    });
    const result = await executeIntervention(makeIntervention({ action: "payment_link" }), makeRecoveryCase());
    expect(result.success).toBe(false);
    expect(result.detail).toContain("Invalid amount");
  });

  it("uses original method when intervention method is 'same'", async () => {
    const result = await executeIntervention(
      makeIntervention({ action: "immediate_retry", method: "same" }),
      makeRecoveryCase()
    );
    expect(result.success).toBe(true);
    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: expect.objectContaining({ recovery_method: "upi" }),
      })
    );
  });

  it("includes both order and payment link in razorpay_response for retries", async () => {
    const result = await executeIntervention(makeIntervention({ action: "immediate_retry" }), makeRecoveryCase());
    expect(result.razorpay_response.order).toBeDefined();
    expect(result.razorpay_response.order.id).toBe("order_test_456");
    expect(result.razorpay_response.payment_link).toBeDefined();
    expect(result.razorpay_response.payment_link.id).toBe("plink_test_123");
  });
});

describe("createOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Razorpay order with recovery metadata", async () => {
    const rc = makeRecoveryCase();
    const result = await createOrder(500000, "INR", "upi", rc);
    expect(result.order_id).toBe("order_test_456");
    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500000,
        currency: "INR",
        notes: expect.objectContaining({
          recovery_case_id: "rec_test123",
          original_order_id: "order_test",
          recovery_method: "upi",
        }),
      })
    );
  });

  it("includes receipt with recovery case ID", async () => {
    const rc = makeRecoveryCase();
    await createOrder(100000, "INR", "card", rc);
    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt: "recovery_rec_test123_abc123",
      })
    );
  });
});
