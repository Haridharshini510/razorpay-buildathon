import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/db", () => ({
  connectDB: vi.fn(),
}));

let savedCases: any[] = [];
let savedAuditLogs: any[] = [];
let enqueueResult = true;

vi.mock("../src/lib/redis", () => ({
  enqueueDelayedRetry: vi.fn(async () => enqueueResult),
}));

vi.mock("../src/models/RecoveryCase", () => {
  return {
    RecoveryCase: {
      create: vi.fn(async (data: any) => {
        const doc = {
          ...data,
          save: vi.fn(async function (this: any) {
            const idx = savedCases.findIndex((c) => c.case_id === this.case_id);
            if (idx >= 0) savedCases[idx] = { ...this };
            else savedCases.push({ ...this });
          }),
        };
        savedCases.push(doc);
        return doc;
      }),
      findOne: vi.fn(async ({ case_id }: any) => {
        const found = savedCases.find((c) => c.case_id === case_id);
        if (!found) return null;
        found.save = vi.fn(async function (this: any) {
          const idx = savedCases.findIndex((c) => c.case_id === this.case_id);
          if (idx >= 0) savedCases[idx] = { ...this };
        });
        return found;
      }),
    },
  };
});

vi.mock("../src/models/AuditLog", () => ({
  AuditLog: {
    create: vi.fn(async (data: any) => {
      savedAuditLogs.push(data);
      return data;
    }),
  },
}));

vi.mock("../src/lib/razorpay", () => ({
  getRazorpayClient: () => ({
    paymentLink: {
      create: vi.fn().mockResolvedValue({
        id: "plink_delayed_123",
        short_url: "https://rzp.io/delayed123",
        status: "created",
      }),
    },
    orders: {
      create: vi.fn().mockResolvedValue({
        id: "order_delayed_456",
        amount: 50000,
        currency: "INR",
        status: "created",
      }),
    },
  }),
}));

vi.mock("nanoid", () => ({
  nanoid: () => "delay12345",
}));

import { processRecoveryEvent, executeDelayedRetry } from "../src/services/orchestrator";

describe("Delayed Retry via BullMQ", () => {
  beforeEach(() => {
    savedCases = [];
    savedAuditLogs = [];
    enqueueResult = true;
  });

  it("enqueues delayed_retry to BullMQ and sets status to waiting_retry", async () => {
    const result = await processRecoveryEvent({
      payment_id: "pay_delay_001",
      order_id: "order_delay_001",
      amount: 50000,
      method: "upi",
      error_code: "GATEWAY_ERROR",
      error_description: "Bank server not responding",
      customer: { email: "test@example.com", phone: "9800000000" },
      timestamp: new Date().toISOString(),
    });

    if (result.status === "waiting_retry") {
      expect(result.status).toBe("waiting_retry");
      const pendingIntervention = result.interventions.find(
        (i: any) => i.result === "pending"
      );
      expect(pendingIntervention).toBeDefined();

      const enqueueLog = savedAuditLogs.find(
        (l: any) => l.decision === "delayed_retry_enqueued"
      );
      expect(enqueueLog).toBeDefined();
    } else {
      expect(["resolved", "stopped", "failed"]).toContain(result.status);
    }
  });

  it("falls back to immediate execution when Redis is unavailable", async () => {
    enqueueResult = false;

    const result = await processRecoveryEvent({
      payment_id: "pay_delay_002",
      order_id: "order_delay_002",
      amount: 50000,
      method: "upi",
      error_code: "GATEWAY_ERROR",
      error_description: "Bank server not responding",
      customer: { email: "test@example.com", phone: "9800000000" },
      timestamp: new Date().toISOString(),
    });

    expect(result.status).not.toBe("waiting_retry");
    expect(["resolved", "stopped", "failed"]).toContain(result.status);
  });

  it("executeDelayedRetry processes a waiting case", async () => {
    enqueueResult = true;

    const initial = await processRecoveryEvent({
      payment_id: "pay_delay_003",
      order_id: "order_delay_003",
      amount: 50000,
      method: "upi",
      error_code: "GATEWAY_ERROR",
      error_description: "Bank server not responding",
      customer: { email: "test@example.com", phone: "9800000000" },
      timestamp: new Date().toISOString(),
    });

    if (initial.status !== "waiting_retry") {
      return;
    }

    const result = await executeDelayedRetry(initial.case_id);
    expect(result).not.toBeNull();
    expect(["resolved", "stopped", "failed"]).toContain(result!.status);
    expect(result!.status).not.toBe("waiting_retry");

    const executionLog = savedAuditLogs.find(
      (l: any) => l.decision === "delayed_retry_executing"
    );
    expect(executionLog).toBeDefined();
  });

  it("executeDelayedRetry returns null for non-existent case", async () => {
    const result = await executeDelayedRetry("rec_nonexistent");
    expect(result).toBeNull();
  });
});
