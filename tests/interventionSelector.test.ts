import { describe, it, expect } from "vitest";
import { fallbackIntervention, InterventionContext } from "../src/services/interventionSelector";
import { DiagnosisResult } from "../src/services/diagnosticEngine";

function makeDiagnosis(overrides: Partial<DiagnosisResult> = {}): DiagnosisResult {
  return {
    root_cause: "bank_server_timeout",
    confidence: 0.8,
    reasoning: "Test diagnosis",
    recoverable: true,
    model_used: "test",
    fallback_used: false,
    ...overrides,
  };
}

function makeContext(overrides: Partial<InterventionContext> = {}): InterventionContext {
  return {
    amount: 500000,
    method: "upi",
    attempt_number: 1,
    max_attempts: 3,
    ...overrides,
  };
}

describe("fallbackIntervention", () => {
  it("selects delayed_retry for bank_server_timeout", () => {
    const result = fallbackIntervention(makeDiagnosis({ root_cause: "bank_server_timeout" }), makeContext());
    expect(result.action).toBe("delayed_retry");
    expect(result.delay_minutes).toBe(15);
    expect(result.method).toBe("upi");
    expect(result.fallback_used).toBe(true);
  });

  it("selects immediate_retry for network_error", () => {
    const result = fallbackIntervention(makeDiagnosis({ root_cause: "network_error" }), makeContext());
    expect(result.action).toBe("immediate_retry");
    expect(result.method).toBe("upi");
  });

  it("selects payment_link for upi_expired", () => {
    const result = fallbackIntervention(makeDiagnosis({ root_cause: "upi_expired" }), makeContext());
    expect(result.action).toBe("payment_link");
    expect(result.method).toBe("upi");
  });

  it("selects payment_link for card_expired", () => {
    const result = fallbackIntervention(makeDiagnosis({ root_cause: "card_expired" }), makeContext({ method: "card" }));
    expect(result.action).toBe("payment_link");
    expect(result.method).toBe("card");
  });

  it("selects delayed_retry for rate_limit with 30 min delay", () => {
    const result = fallbackIntervention(makeDiagnosis({ root_cause: "rate_limit" }), makeContext());
    expect(result.action).toBe("delayed_retry");
    expect(result.delay_minutes).toBe(30);
  });

  it("selects alternate_method for bank_maintenance", () => {
    const result = fallbackIntervention(makeDiagnosis({ root_cause: "bank_maintenance" }), makeContext());
    expect(result.action).toBe("alternate_method");
    expect(result.method).toBe("card");
  });

  it("selects customer_nudge for insufficient_funds", () => {
    const result = fallbackIntervention(makeDiagnosis({ root_cause: "insufficient_funds" }), makeContext());
    expect(result.action).toBe("customer_nudge");
    expect(result.method).toBe("upi");
  });

  it("selects alternate_method for bank_declined", () => {
    const result = fallbackIntervention(makeDiagnosis({ root_cause: "bank_declined" }), makeContext());
    expect(result.action).toBe("alternate_method");
    expect(result.method).toBe("upi");
  });

  it("defaults to payment_link for unknown root causes", () => {
    const result = fallbackIntervention(makeDiagnosis({ root_cause: "unknown_cause" }), makeContext());
    expect(result.action).toBe("payment_link");
    expect(result.method).toBe("upi");
  });

  it("preserves original method when mapping says 'same'", () => {
    const result = fallbackIntervention(
      makeDiagnosis({ root_cause: "network_error" }),
      makeContext({ method: "netbanking" })
    );
    expect(result.method).toBe("netbanking");
  });

  it("uses mapped method when mapping specifies a different one", () => {
    const result = fallbackIntervention(
      makeDiagnosis({ root_cause: "bank_maintenance" }),
      makeContext({ method: "upi" })
    );
    expect(result.method).toBe("card");
  });
});
