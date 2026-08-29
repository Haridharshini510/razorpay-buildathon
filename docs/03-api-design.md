# API Design: AI Revenue Recovery Agent

## External APIs (Razorpay Integration)

### Razorpay APIs We Consume (Test Mode)

| API | Endpoint | Purpose |
|-----|----------|---------|
| Orders | `POST /v1/orders` | Create test orders to simulate failures |
| Payments | `GET /v1/payments/:id` | Fetch failure details, error codes |
| Payments | `POST /v1/payments/:id/capture` | Capture recovered payment |
| Payment Links | `POST /v1/payment_links` | Create recovery payment links |
| Subscriptions | `POST /v1/subscriptions` | Create test subscriptions |
| Webhooks | Inbound `POST` | Receive payment.failed events |

### Razorpay Error Codes We Classify

```
BAD_REQUEST_ERROR    → Customer input issue (wrong CVV, expired card)
GATEWAY_ERROR        → Bank/network issue (timeout, downtime)
SERVER_ERROR         → Razorpay internal (rare, not recoverable by us)
```

Sub-codes from `payment.error_description`:
- "Your payment didn't go through as it was declined by the bank"
- "Payment was unsuccessful as the bank server is not responding"
- "Your payment could not be completed as the UPI transaction expired"
- "Insufficient account balance"

---

## Internal API (Next.js API Routes)

### Base URL: `http://localhost:3000/api`

---

### Webhooks

#### `POST /api/webhooks/razorpay`

Receives Razorpay webhook events.

**Headers**: `X-Razorpay-Signature` (HMAC verification)

**Body** (from Razorpay):
```json
{
  "entity": "event",
  "event": "payment.failed",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_abc123",
        "order_id": "order_xyz",
        "amount": 50000,
        "currency": "INR",
        "method": "upi",
        "error_code": "GATEWAY_ERROR",
        "error_description": "Payment was unsuccessful as the bank server is not responding",
        "error_reason": "bank_server_timeout"
      }
    }
  }
}
```

**Response**: `200 OK` (always acknowledge quickly)

---

### Batch Processing

#### `POST /api/batch/process`

Submit a batch of failure events for processing.

**Request Body**:
```json
{
  "events": [
    {
      "type": "payment_failure",
      "payment_id": "pay_sim_001",
      "order_id": "order_sim_001",
      "amount": 2500,
      "currency": "INR",
      "method": "upi",
      "error_code": "GATEWAY_ERROR",
      "error_description": "Bank server not responding",
      "customer": {
        "email": "test@example.com",
        "phone": "9876543210"
      },
      "timestamp": "2026-08-28T14:30:00Z"
    },
  ]
}
```

**Response**:
```json
{
  "batch_id": "batch_abc123",
  "total_events": 50,
  "status": "processing",
  "created_at": "2026-08-28T14:30:00Z"
}
```

#### `GET /api/batch/:batchId`

Get batch processing status and results.

**Response**:
```json
{
  "batch_id": "batch_abc123",
  "status": "completed",
  "total": 50,
  "results": {
    "recovered": 34,
    "stopped": 10,
    "failed": 4,
    "pending": 2
  },
  "recovery_rate": 0.68,
  "breakdown": {
    "by_type": {
      "bank_timeout": { "total": 15, "recovered": 13 },
      "insufficient_funds": { "total": 10, "recovered": 3 },
      "card_expired": { "total": 8, "recovered": 6 },
      "upi_expired": { "total": 7, "recovered": 5 },
      "network_error": { "total": 10, "recovered": 7 }
    },
    "by_intervention": {
      "immediate_retry": 12,
      "delayed_retry": 8,
      "payment_link": 7,
      "alternate_method": 5,
      "customer_nudge": 2
    }
  },
  "completed_at": "2026-08-28T14:35:00Z"
}
```

---

### Recovery Cases

#### `GET /api/recoveries`

List all recovery cases with filtering.

**Query Params**: `?status=resolved&type=payment_failure&page=1&limit=20`

#### `GET /api/recoveries/:id`

Get single recovery case with full timeline.

**Response**:
```json
{
  "id": "rec_abc123",
  "type": "payment_failure",
  "status": "resolved",
  "original_event": {
    "payment_id": "pay_abc123",
    "amount": 5000,
    "method": "upi",
    "error_code": "GATEWAY_ERROR",
    "timestamp": "2026-08-28T14:30:00Z"
  },
  "diagnosis": {
    "root_cause": "bank_server_timeout",
    "confidence": 0.92,
    "reasoning": "HDFC UPI gateway timeout at peak hours, consistent with known load pattern",
    "recoverable": true
  },
  "interventions": [
    {
      "attempt": 1,
      "action": "delayed_retry",
      "delay_minutes": 10,
      "method": "upi",
      "executed_at": "2026-08-28T14:40:00Z",
      "result": "failed",
      "new_error": "GATEWAY_ERROR"
    },
    {
      "attempt": 2,
      "action": "alternate_method",
      "method": "card",
      "executed_at": "2026-08-28T14:55:00Z",
      "result": "success",
      "recovered_amount": 5000
    }
  ],
  "stopping_rules_log": [
    { "rule": "max_retries", "value": "2/3", "triggered": false },
    { "rule": "time_window", "value": "25min/24hr", "triggered": false }
  ],
  "outcome": "recovered",
  "total_time_to_recovery": "25 minutes",
  "audit_trail": ["...see audit endpoint"]
}
```

---

### Audit Trail

#### `GET /api/audit`

Query audit log.

**Query Params**: `?recovery_id=rec_abc123&stage=intervention_selected&from=2026-08-28`

**Response**:
```json
{
  "entries": [
    {
      "id": "aud_001",
      "recovery_id": "rec_abc123",
      "timestamp": "2026-08-28T14:30:05Z",
      "stage": "diagnosis",
      "decision": "bank_server_timeout",
      "confidence": 0.92,
      "reasoning": "GATEWAY_ERROR from HDFC at 14:30 IST matches known peak-hour pattern",
      "ai_used": true,
      "model": "claude-sonnet-5"
    },
    {
      "id": "aud_002",
      "recovery_id": "rec_abc123",
      "timestamp": "2026-08-28T14:30:06Z",
      "stage": "stopping_rules_check",
      "decision": "proceed",
      "reasoning": "All rules passed: retries 0/3, time 0min/24hr, nudges 0/2",
      "ai_used": false
    }
  ]
}
```

---

### Dashboard Metrics

#### `GET /api/metrics/summary`

**Response**:
```json
{
  "total_events_processed": 247,
  "total_recovered": 168,
  "total_stopped": 52,
  "total_failed": 27,
  "recovery_rate": 0.68,
  "total_amount_recovered": 1250000,
  "avg_time_to_recovery": "18 minutes",
  "by_failure_type": {
    "bank_timeout": { "count": 80, "recovery_rate": 0.85 },
    "insufficient_funds": { "count": 45, "recovery_rate": 0.31 },
    "card_expired": { "count": 35, "recovery_rate": 0.71 },
    "upi_expired": { "count": 40, "recovery_rate": 0.62 },
    "network_error": { "count": 47, "recovery_rate": 0.76 }
  }
}
```

---

### Simulation (for Demo/Testing)

#### `POST /api/simulate/failures`

Generate a batch of realistic simulated failures for testing.

**Request Body**:
```json
{
  "count": 50,
  "distribution": {
    "bank_timeout": 0.30,
    "insufficient_funds": 0.20,
    "card_expired": 0.15,
    "upi_expired": 0.15,
    "network_error": 0.20
  },
  "amount_range": { "min": 500, "max": 100000 }
}
```

**Response**: Generates and immediately processes the batch, returns `batch_id`.

---

## Authentication

For hackathon scope:
- No user auth on the dashboard (single-tenant, local/demo use)
- Razorpay webhook signature verification using `X-Razorpay-Signature` header
- Claude API key stored in `.env.local`
- Razorpay test keys in `.env.local`

## Error Handling

All API errors follow:
```json
{
  "error": {
    "code": "BATCH_NOT_FOUND",
    "message": "Batch with id batch_xyz does not exist",
    "timestamp": "2026-08-28T14:30:00Z"
  }
}
```