# Technical Architecture: AI Revenue Recovery Agent

## System Overview

```
                    ┌─────────────────────────────────┐
                    │     Next.js Application          │
                    │                                  │
                    │  ┌───────────────────────────┐   │
                    │  │   React Dashboard (Pages) │   │
                    │  │  (Metrics, Audit, Monitor) │   │
                    │  └──────────────┬────────────┘   │
                    │                 │ Server Actions  │
                    │  ┌──────────────▼────────────┐   │
                    │  │      API Routes           │   │
                    │  │  /api/webhooks            │   │
                    │  │  /api/batch               │   │
                    │  │  /api/recoveries          │   │
                    │  └──────────────┬────────────┘   │
                    │                 │                 │
                    │  ┌──────────────▼────────────┐   │
                    │  │   Recovery Orchestrator    │   │
                    │  └──────────────┬────────────┘   │
                    │                 │                 │
                    │    ┌────────────┼──────────┐     │
                    │    ▼            ▼          ▼     │
                    │ ┌──────┐  ┌────────┐ ┌───────┐  │
                    │ │Diag- │  │Inter-  │ │Execu- │  │
                    │ │nostic│  │vention │ │tion   │  │
                    │ │Engine│  │Selector│ │Engine │  │
                    │ └──┬───┘  └───┬────┘ └───┬───┘  │
                    │    │          │          │       │
                    │    ▼          ▼          ▼       │
                    │ ┌──────────────────────────┐     │
                    │ │     Stopping Rules       │     │
                    │ │   (Deterministic Gate)   │     │
                    │ └──────────────────────────┘     │
                    │                                  │
                    └──────────┬───────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
┌──────────────────┐ ┌─────────────────┐ ┌──────────────┐
│     MongoDB      │ │  Redis + BullMQ │ │   External   │
│ (Events, Audit)  │ │ (Delayed Jobs)  │ │  Services    │
└──────────────────┘ └─────────────────┘ │ - Razorpay   │
                                          │ - Claude API │
                                          └──────────────┘
```

## Component Breakdown

### 1. Webhook Receiver (`/api/webhooks/razorpay`)

Next.js API route that receives real-time events from Razorpay test mode:
- `payment.failed` — a payment attempt failed
- `subscription.halted` — recurring payment exhausted retries

Validates webhook signature, normalizes event into internal format, enqueues into BullMQ for processing.

### 2. Batch Processor (`/api/batch`)

Accepts a batch of simulated failure events (JSON array), processes them sequentially through the same pipeline as webhooks. Used for:
- Demo: "here's 100 failures, watch the agent process them"
- Testing: deterministic input → verifiable output
- Metrics: measured recovery rate across a controlled set

### 3. Recovery Orchestrator

The brain. Coordinates the pipeline for each failed payment/overdue invoice:

```
Event → Diagnose → Check Stopping Rules → Select Intervention → Execute → Log
                         ↓ (if stopped)
                    Log reason + stop
```

Manages state machine per recovery case:
- `received` → `diagnosing` → `intervention_selected` → `executing` → `resolved` | `stopped` | `failed`

### 4. Diagnostic Engine (AI-Powered)

Takes raw failure data and produces a structured diagnosis:

**Input**: error code, payment method, amount, time, customer history
**Output**: 
```json
{
  "root_cause": "bank_server_timeout",
  "confidence": 0.92,
  "reasoning": "HDFC UPI gateway returned GATEWAY_ERROR at 23:45 IST, consistent with scheduled maintenance window",
  "recoverable": true,
  "suggested_wait": "15_minutes"
}
```

Uses LLM to interpret ambiguous error codes with context (time of day, bank patterns, historical data).

### 5. Intervention Selector (AI-Powered)

Given the diagnosis, selects the best recovery action:

**Decision factors**:
- Root cause type
- Payment amount (high-value gets more aggressive recovery)
- Time since failure
- Customer's payment history (if available)
- Method availability (can they try UPI if card failed?)

**Output**:
```json
{
  "action": "delayed_retry",
  "method": "upi",
  "delay_minutes": 15,
  "fallback": "payment_link",
  "reasoning": "Bank timeout likely transient, UPI retry after maintenance window"
}
```

### 6. Execution Engine

Executes the chosen intervention via Razorpay APIs:

| Intervention | Razorpay API Used |
|-------------|-------------------|
| Retry payment | Create new payment attempt on same order |
| Payment link | Payment Links API — create and "send" |
| Alternate method | Create order with preferred method hint |
| Customer nudge | Simulated SMS/WhatsApp (logged, not actually sent in test mode) |

### 7. Stopping Rules Engine (Deterministic — NO AI)

Hard-coded rules that CANNOT be overridden:

```javascript
const STOPPING_RULES = {
  maxRetries: 3,
  maxTimeWindow: 24 * 60 * 60 * 1000, // 24 hours
  maxNudges: 2,
  minRetryInterval: 5 * 60 * 1000, // 5 minutes between retries
  maxDailyAttempts: 5,
  amountCeiling: 100000, // don't auto-retry above ₹1L without flag
  quietHours: { start: 22, end: 8 }, // no nudges 10pm-8am
};
```

### 8. Audit Logger

Append-only log of every decision:

```json
{
  "event_id": "evt_abc123",
  "timestamp": "2026-08-28T14:30:00Z",
  "stage": "intervention_selected",
  "decision": "delayed_retry",
  "reasoning": "Bank timeout at 23:45, likely maintenance. Retry after 15min.",
  "confidence": 0.92,
  "stopping_rules_checked": ["max_retries: 1/3", "time_window: 2min/24hr"],
  "outcome": "pending"
}
```

### 9. BullMQ Job Queue (Redis-Backed)

Handles all delayed/scheduled work — this is core infrastructure, not optional:

- **Delayed retries**: "Retry this payment in 15 minutes" → BullMQ delayed job
- **Batch processing**: Each failure event enqueued as a job, processed by worker
- **Backoff**: Built-in exponential backoff for failed jobs
- **Observability**: Bull Board UI for monitoring queue health during demo

```javascript
// Example: scheduling a delayed retry
await recoveryQueue.add('retry-payment', {
  caseId: 'rec_abc123',
  orderId: 'order_xyz',
  method: 'upi'
}, {
  delay: 15 * 60 * 1000, // 15 minutes
  attempts: 1,
  removeOnComplete: true
});
```

### 10. Dashboard (Next.js Pages)

Three main views (using Tremor/shadcn chart components for speed):
1. **Batch Results** — pie chart of outcomes, recovery rate, breakdown by failure type
2. **Recovery Timeline** — individual payment journey (each step visualized)
3. **Audit Log** — searchable, filterable decision log

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js (App Router) | Unified frontend + API, no CORS, server components, one deploy |
| UI Components | Tailwind CSS + Tremor (charts) + shadcn/ui | Pre-built dashboard components, minimal custom CSS |
| Database | MongoDB + Mongoose | Flexible schemas for varied event types |
| Job Queue | BullMQ + Redis | Delayed retries, batch processing, scheduled jobs — required for core "retry in N minutes" flow |
| AI/LLM | Claude API (tool_use for structured output) | Root cause diagnosis + intervention selection. tool_use gives reliable JSON without prompt engineering fragility |
| Payment APIs | Razorpay Node SDK (test mode) | Native integration |

## Data Flow: Payment Failure Recovery

```
1. Razorpay fires `payment.failed` webhook
2. Webhook receiver validates signature, stores raw event
3. Orchestrator picks it up, moves state to `diagnosing`
4. Diagnostic Engine calls LLM with error context
5. LLM returns root cause + confidence + recoverability
6. Stopping Rules gate: check max retries, time window, etc.
7. If NOT stopped → Intervention Selector picks action
8. Execution Engine runs the action via Razorpay API
9. Result captured → state moves to `resolved` or `failed`
10. Audit logger records everything
11. Dashboard updates in real-time (polling or SSE)
```

## Data Flow: Delayed Retry (BullMQ)

```
1. Intervention Selector decides: "delayed_retry, 15 minutes, UPI"
2. Orchestrator enqueues job to BullMQ with 15min delay
3. Recovery case status → "waiting_retry"
4. ... 15 minutes pass ...
5. BullMQ fires job → worker picks it up
6. Worker calls Execution Engine → Razorpay API
7. Result captured → case moves to "resolved" or back to orchestrator for next attempt
8. Audit log updated
```

## Deployment (for hackathon)

- `docker-compose.yml` with MongoDB + Redis (two services, both have official images)
- Next.js app runs locally or deploys to Vercel (free tier)
- ngrok for Razorpay webhook delivery to localhost
- `.env.local` for Razorpay test keys + Claude API key
- Bull Board accessible at `/admin/queues` for demo observability