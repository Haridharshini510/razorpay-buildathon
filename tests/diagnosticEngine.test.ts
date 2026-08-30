import { describe, it, expect } from "vitest";
import { fallbackDiagnosis, DiagnosisInput } from "../src/services/diagnosticEngine";

function makeInput(overrides: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return {
    error_code: "GATEWAY_ERROR",
    error_description: "Payment failed",
    method: "upi",
    amount: 500000,
    timestamp: "2026-08-29T14:00:00Z",
    ...overrides,
  };
}

describe("fallbackDiagnosis", () => {
  it("identifies bank server timeout from description", () => {
    const result = fallbackDiagnosis(
      makeInput({ error_description: "Payment was unsuccessful as the bank server is not responding" })
    );
    expect(result.root_cause).toBe("bank_server_timeout");
    expect(result.recoverable).toBe(true);
    expect(result.fallback_used).toBe(true);
    expect(result.confidence).toBe(0.5);
  });

  it("identifies insufficient funds", () => {
    const result = fallbackDiagnosis(
      makeInput({ error_description: "Your account has insufficient balance" })
    );
    expect(result.root_cause).toBe("insufficient_funds");
    expect(result.recoverable).toBe(false);
  });

  it("identifies UPI expiry", () => {
    const result = fallbackDiagnosis(
      makeInput({ error_description: "UPI collect request expired" })
    );
    expect(result.root_cause).toBe("upi_expired");
    expect(result.recoverable).toBe(true);
  });

  it("identifies card expiry", () => {
    const result = fallbackDiagnosis(
      makeInput({ error_description: "The card has expired" })
    );
    expect(result.root_cause).toBe("card_expired");
    expect(result.recoverable).toBe(true);
  });

  it("identifies network error", () => {
    const result = fallbackDiagnosis(
      makeInput({ error_description: "Connection to bank network failed" })
    );
    expect(result.root_cause).toBe("network_error");
    expect(result.recoverable).toBe(true);
  });

  it("identifies bank decline", () => {
    const result = fallbackDiagnosis(
      makeInput({ error_description: "Transaction declined by the bank" })
    );
    expect(result.root_cause).toBe("bank_declined");
    expect(result.recoverable).toBe(false);
  });

  it("falls back to error code when description has no hints", () => {
    const result = fallbackDiagnosis(
      makeInput({ error_code: "GATEWAY_ERROR", error_description: "Something went wrong" })
    );
    expect(result.root_cause).toBe("bank_server_timeout");
    expect(result.recoverable).toBe(true);
    expect(result.confidence).toBe(0.4);
  });

  it("falls back to BAD_REQUEST_ERROR code mapping", () => {
    const result = fallbackDiagnosis(
      makeInput({ error_code: "BAD_REQUEST_ERROR", error_description: "Something unusual" })
    );
    expect(result.root_cause).toBe("invalid_details");
    expect(result.recoverable).toBe(false);
  });

  it("returns unknown for unrecognized errors", () => {
    const result = fallbackDiagnosis(
      makeInput({ error_code: "CUSTOM_ERROR", error_description: "Something totally new" })
    );
    expect(result.root_cause).toBe("unknown");
    expect(result.recoverable).toBe(false);
    expect(result.confidence).toBe(0.2);
  });

  it("provides suggested_wait_minutes for recoverable cases", () => {
    const result = fallbackDiagnosis(
      makeInput({ error_description: "Bank server timeout" })
    );
    expect(result.suggested_wait_minutes).toBe(15);
  });

  it("does not provide suggested_wait_minutes for non-recoverable cases", () => {
    const result = fallbackDiagnosis(
      makeInput({ error_description: "Transaction declined by the bank" })
    );
    expect(result.suggested_wait_minutes).toBeUndefined();
  });

  it("description hints take priority over error code", () => {
    const result = fallbackDiagnosis(
      makeInput({
        error_code: "GATEWAY_ERROR",
        error_description: "Your account has insufficient balance",
      })
    );
    expect(result.root_cause).toBe("insufficient_funds");
  });
});
