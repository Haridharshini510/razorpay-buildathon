import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/db", () => ({
  connectDB: vi.fn(),
}));

let savedCases: any[] = [];
let savedAuditLogs: any[] = [];

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
        id: "plink_e2e_123",
        short_url: "https://rzp.io/e2e123",
        status: "created",
      }),
    },
    orders: {
      create: vi.fn().mockResolvedValue({
        id: "order_e2e_456",
        amount: 50000,
        currency: "INR",
        status: "created",
      }),
    },
  }),
}));

vi.mock("nanoid", () => ({
  nanoid: () => "e2etest12345",
}));

import { processRecoveryEvent } from "../src/services/orchestrator";

describe("Pipeline E2E", () => {
  beforeEach(() => {
    savedCases = [];
    savedAuditLogs = [];
  });

  it("processes a recoverable failure through the full pipeline", async () => {
    const result = await processRecoveryEvent({
      payment_id: "pay_e2e_001",
      order_id: "order_e2e_001",
      amount: 50000,
      method: "upi",
      error_code: "GATEWAY_ERROR",
      error_description: "Bank server not responding",
      customer: { email: "test@example.com", phone: "9800000000" },
      timestamp: new Date().toISOString(),
    });

    expect(result.case_id).toBe("rec_e2etest12345");
    expect(result.status).toBe("resolved");
    expect(result.outcome.result).toBe("recovered");

    expect(result.diagnosis).toBeDefined();
    expect(result.diagnosis.root_cause).toBe("bank_server_timeout");
    expect(result.diagnosis.recoverable).toBe(true);

    expect(result.interventions.length).toBeGreaterThan(0);

    const stages = savedAuditLogs.map((l: any) => l.stage);
    expect(stages).toContain("intake");
    expect(stages).toContain("diagnosis");
    expect(stages).toContain("stopping_check");
    expect(stages).toContain("intervention_selection");
    expect(stages).toContain("execution");
    expect(stages).toContain("outcome");
  });

  it("stops immediately for non-recoverable failures", async () => {
    const result = await processRecoveryEvent({
      payment_id: "pay_e2e_002",
      order_id: "order_e2e_002",
      amount: 100000,
      method: "card",
      error_code: "BAD_REQUEST_ERROR",
      error_description: "Insufficient funds in account",
      customer: { email: "test@example.com", phone: "9800000000" },
      timestamp: new Date().toISOString(),
    });

    expect(result.status).toBe("stopped");
    expect(result.outcome.result).toBe("stopped");
    expect(result.diagnosis.root_cause).toBe("insufficient_funds");
    expect(result.diagnosis.recoverable).toBe(false);

    const stages = savedAuditLogs.map((l: any) => l.stage);
    expect(stages).toContain("intake");
    expect(stages).toContain("diagnosis");
    expect(stages).toContain("outcome");
    expect(stages).not.toContain("execution");
  });

  it("logs AI vs fallback correctly in audit trail", async () => {
    const result = await processRecoveryEvent({
      payment_id: "pay_e2e_003",
      order_id: "order_e2e_003",
      amount: 25000,
      method: "netbanking",
      error_code: "GATEWAY_ERROR",
      error_description: "Network connection timeout",
      customer: { email: "test@example.com", phone: "9800000000" },
      timestamp: new Date().toISOString(),
    });

    const diagnosisLog = savedAuditLogs.find((l: any) => l.stage === "diagnosis");
    expect(diagnosisLog).toBeDefined();
    expect(diagnosisLog.ai_used).toBe(false);
    expect(diagnosisLog.llm_model).toBe("fallback_rules");

    const stoppingLog = savedAuditLogs.find((l: any) => l.stage === "stopping_check");
    expect(stoppingLog).toBeDefined();
    expect(stoppingLog.ai_used).toBe(false);
  });

  it("includes batch_id when processing as part of a batch", async () => {
    const result = await processRecoveryEvent(
      {
        payment_id: "pay_e2e_004",
        order_id: "order_e2e_004",
        amount: 75000,
        method: "upi",
        error_code: "GATEWAY_ERROR",
        error_description: "Bank server timeout",
        customer: { email: "test@example.com", phone: "9800000000" },
        timestamp: new Date().toISOString(),
      },
      "batch_test123"
    );

    expect(result.batch_id).toBe("batch_test123");
    savedAuditLogs.forEach((log: any) => {
      expect(log.batch_id).toBe("batch_test123");
    });
  });
});
