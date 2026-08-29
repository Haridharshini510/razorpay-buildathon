# Product Requirements Document: AI Revenue Recovery Agent

## Problem Statement

Indian digital payments have a 15-25% failure rate. When a payment fails, the merchant gets a generic error code and the customer gets "Payment Failed. Try again." Nobody diagnoses WHY it failed, nobody picks the right recovery action, and nobody follows up intelligently.

On the B2B side, overdue invoices pile up because reminders are manual, inconsistent, and emotionally loaded. Nobody tracks why payment is late or escalates based on context.

In both cases, **the intent to pay already exists** — money is falling through cracks that intelligent automation can seal.

## Product Vision

An AI-powered recovery agent focused on the **immediate** time horizon:
- Payment just failed → diagnose root cause → select optimal intervention → execute recovery → track outcome

The agent turns Razorpay's dumb "Payment Failed" into an intelligent, auditable recovery pipeline.

## Target Users

1. **Online merchants** (D2C brands, SaaS companies, e-commerce) losing revenue to payment failures

## Core Value Proposition

"Every failed payment has a reason. Every reason has a best response. Every response has an optimal timing. We automate the entire loop."

## Success Metrics (for hackathon demo)

| Metric | Target |
|--------|--------|
| Recovery rate on simulated batch | >60% of recoverable failures |
| Correct diagnosis rate | >85% root cause accuracy |
| False interventions | 0 (never retry when it should stop) |
| Compliance violations | 0 (stopping rules always respected) |
| Audit trail completeness | 100% of decisions logged with reasoning |

## Features

### P0 — Must Have (Hackathon Submission)

1. **Failure Intake & Classification**
   - Receive payment failure events (via webhook or batch input)
   - Classify root cause using AI (bank timeout, insufficient funds, card expired, network error, UPI failure, rate limit)
   - Confidence scoring on diagnosis

2. **Intervention Engine**
   - Decision matrix: failure type → best intervention
   - Interventions: immediate retry, delayed retry, alternate method suggestion, payment link generation, customer nudge
   - AI selects optimal intervention based on context (amount, time of day, failure history, method used)

3. **Execution Layer**
   - Execute the chosen intervention via Razorpay test-mode APIs
   - Payment retry, payment link creation, method switching
   - Track execution result (success/failure of recovery attempt)

4. **Stopping Rules (Deterministic, No AI)**
   - Max retry attempts per payment (3)
   - Time window limits (no retries after 24 hours)
   - Customer fatigue rules (max 2 nudges per payment)
   - Amount thresholds (different rules for high-value vs low-value)
   - Compliance: RBI guidelines on auto-debit, communication frequency

5. **Audit Trail**
   - Every decision logged: what happened, what was diagnosed, what action was taken, why
   - Every stopping decision logged: why we chose NOT to act
   - Timestamped, queryable, exportable

6. **Dashboard**
   - Recovery metrics: attempted vs recovered vs stopped
   - Breakdown by failure type
   - Batch run results
   - Individual payment journey view (timeline of attempts)

### P1 — Nice to Have

- **B2B Overdue Recovery**
  - Track invoice aging (days past due)
  - Tiered escalation: gentle reminder → firm follow-up → escalation notice
  - Promise-to-pay tracking (record commitment, follow up on date)
  - AI generates contextual messages (tone varies by relationship and delay)
- Hinglish message generation for customer nudges
- Smart timing optimization (learn best time to retry/nudge)
- Webhook-driven real-time mode (live processing, not just batch)
- Recovery rate comparison: with agent vs without (baseline)

### P2 — Future / Out of Scope

- Production deployment
- Real money movement
- Multi-tenant merchant support
- Integration with merchant CRMs/ERPs

## Constraints

- Must use Razorpay test-mode APIs (`rzp_test_*` keys)
- Must demonstrate AI judgment AND where AI is deliberately NOT used
- Must handle failures gracefully (what happens when the recovery agent itself fails?)
- 7-day build timeline
- Next.js full-stack (API routes + React) + MongoDB + BullMQ/Redis

## What "AI Judgment" Means Here

| AI Handles | NOT AI (Deterministic) |
|------------|----------------------|
| Root cause classification from error codes + context | Stopping rules (hard limits) |
| Intervention selection (which action fits this failure) | Compliance checks (RBI rules) |
| Timing optimization (when to retry/nudge) | API calls (retry is just an API call) |
| Message generation (tone, language, content) | Audit logging (structured, always runs) |
| Confidence scoring (how sure are we of the diagnosis) | Max attempt counters |

## Non-Functional Requirements

- Audit trail must be append-only (never delete/modify past decisions)
- Stopping rules must be deterministic (never overridden by AI)
- System must gracefully degrade if LLM is unavailable (fall back to rule-based decisions)
- Batch processing must handle 100+ failures without timeout