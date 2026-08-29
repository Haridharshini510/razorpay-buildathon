# Database Schema: AI Revenue Recovery Agent

## MongoDB Collections

---

### 1. `recovery_cases`

The central collection. One document per failed payment being recovered.

```javascript
{
  _id: ObjectId,
  
  // Identity
  case_id: "rec_abc123",        // friendly ID
  batch_id: "batch_xyz",        // null if from webhook (not batch)
  type: "payment_failure",      // "payment_failure" (P1: "overdue_invoice")
  
  // Status
  status: "resolved",           // "received" | "diagnosing" | "intervening" | "resolved" | "stopped" | "failed"
  
  // Original event data
  original_event: {
    payment_id: "pay_abc123",   // Razorpay payment ID
    order_id: "order_xyz",
    amount: 5000,               // in paise (₹50.00)
    currency: "INR",
    method: "upi",              // "upi" | "card" | "netbanking" | "wallet"
    error_code: "GATEWAY_ERROR",
    error_description: "Bank server not responding",
    customer: {
      email: "user@example.com",
      phone: "9876543210",
      name: "Rahul Sharma"
    },
    occurred_at: ISODate("2026-08-28T14:30:00Z")
  },
  
  // Diagnosis (AI-generated)
  diagnosis: {
    root_cause: "bank_server_timeout",
    confidence: 0.92,
    reasoning: "HDFC UPI gateway timeout at peak hours",
    recoverable: true,
    suggested_wait_minutes: 15,
    diagnosed_at: ISODate("2026-08-28T14:30:05Z"),
    model_used: "claude-sonnet-5",
    fallback_used: false        // true if LLM was unavailable
  },
  
  // Interventions (array of attempts)
  interventions: [
    {
      attempt: 1,
      action: "delayed_retry",
      method: "upi",
      delay_minutes: 15,
      reasoning: "Bank timeout likely transient, retry after cool-off",
      scheduled_at: ISODate("2026-08-28T14:45:00Z"),
      executed_at: ISODate("2026-08-28T14:45:02Z"),
      result: "failed",
      result_detail: "GATEWAY_ERROR persists",
      razorpay_response: { /* raw API response */ }
    },
    {
      attempt: 2,
      action: "alternate_method",
      method: "card",
      reasoning: "UPI still down, customer has saved card",
      scheduled_at: ISODate("2026-08-28T14:55:00Z"),
      executed_at: ISODate("2026-08-28T14:55:01Z"),
      result: "success",
      result_detail: "Payment captured successfully",
      recovered_amount: 5000,
      new_payment_id: "pay_recovered_456"
    }
  ],
  
  // Stopping rules state
  stopping_state: {
    retry_count: 2,
    nudge_count: 0,
    first_attempt_at: ISODate("2026-08-28T14:30:00Z"),
    last_attempt_at: ISODate("2026-08-28T14:55:01Z"),
    stopped: false,
    stop_reason: null
  },
  
  // Outcome
  outcome: {
    result: "recovered",        // "recovered" | "stopped" | "failed" | "pending"
    recovered_amount: 5000,
    time_to_recovery_ms: 1501000, // ~25 minutes
    total_attempts: 2,
    final_method: "card"
  },
  
  // Timestamps
  created_at: ISODate("2026-08-28T14:30:00Z"),
  updated_at: ISODate("2026-08-28T14:55:01Z"),
  resolved_at: ISODate("2026-08-28T14:55:01Z")
}
```

**Indexes**:
- `{ case_id: 1 }` — unique
- `{ batch_id: 1, status: 1 }` — batch queries
- `{ status: 1, type: 1 }` — filtering
- `{ "original_event.occurred_at": -1 }` — time-based queries
- `{ "diagnosis.root_cause": 1 }` — analytics

---

### 2. `audit_logs`

Append-only log of every decision made by the system.

```javascript
{
  _id: ObjectId,
  
  audit_id: "aud_001",
  recovery_case_id: "rec_abc123",
  batch_id: "batch_xyz",        // for batch-level queries
  
  // What happened
  timestamp: ISODate("2026-08-28T14:30:05Z"),
  stage: "diagnosis",           // "intake" | "diagnosis" | "stopping_check" | "intervention_selection" | "execution" | "outcome"
  
  // The decision
  decision: "bank_server_timeout",
  reasoning: "HDFC UPI gateway timeout at peak hours, consistent with known load pattern",
  confidence: 0.92,
  
  // AI metadata
  ai_used: true,
  model: "claude-sonnet-5",
  prompt_tokens: 450,
  completion_tokens: 120,
  latency_ms: 800,
  
  // Context at time of decision
  context: {
    attempt_number: 1,
    stopping_rules_state: {
      retries: "0/3",
      time_window: "0min/24hr",
      nudges: "0/2"
    }
  }
}
```

**Indexes**:
- `{ recovery_case_id: 1, timestamp: 1 }` — case timeline
- `{ batch_id: 1 }` — batch audit
- `{ stage: 1, timestamp: -1 }` — stage filtering
- `{ ai_used: 1 }` — AI vs non-AI decisions

---

### 3. `batches`

Tracks batch processing runs.

```javascript
{
  _id: ObjectId,
  
  batch_id: "batch_abc123",
  
  // Config
  total_events: 50,
  distribution: {
    bank_timeout: 15,
    insufficient_funds: 10,
    card_expired: 8,
    upi_expired: 7,
    network_error: 10
  },
  
  // Status
  status: "completed",          // "processing" | "completed" | "failed"
  
  // Results
  results: {
    recovered: 34,
    stopped: 10,
    failed: 4,
    pending: 2
  },
  recovery_rate: 0.68,
  total_amount_processed: 2500000,
  total_amount_recovered: 1700000,
  
  // Timing
  started_at: ISODate("2026-08-28T14:30:00Z"),
  completed_at: ISODate("2026-08-28T14:35:00Z"),
  processing_time_ms: 300000
}
```

**Indexes**:
- `{ batch_id: 1 }` — unique
- `{ status: 1, started_at: -1 }` — recent batches

---

### 4. `system_config`

Runtime configuration (stopping rules, retry parameters). Stored in DB so dashboard can display them.

```javascript
{
  _id: ObjectId,
  
  key: "stopping_rules",
  value: {
    max_retries: 3,
    max_time_window_hours: 24,
    max_nudges: 2,
    min_retry_interval_minutes: 5,
    max_daily_attempts: 5,
    amount_ceiling_paise: 10000000,  // ₹1,00,000
    quiet_hours: { start: 22, end: 8 }
  },
  
  updated_at: ISODate("2026-08-28T10:00:00Z")
}
```

---

## Relationships

```
batches (1) ──────── (N) recovery_cases
recovery_cases (1) ── (N) audit_logs
```

## Data Volume Estimates (Hackathon)

| Collection | Expected Documents | Size |
|-----------|-------------------|------|
| recovery_cases | 100-500 (from batch runs) | ~2MB |
| audit_logs | 500-2500 (5 per case avg) | ~5MB |
| batches | 5-20 | <1MB |
| system_config | 1-5 | <1KB |

MongoDB Atlas free tier (512MB) is more than sufficient.