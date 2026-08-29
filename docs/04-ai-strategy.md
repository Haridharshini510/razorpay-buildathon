# AI/LLM Strategy: AI Revenue Recovery Agent

## Philosophy

AI is used where pattern recognition and contextual reasoning add value over rules. AI is NOT used where deterministic logic is safer, more predictable, or required for compliance. The judges explicitly evaluate "where you chose NOT to use AI" — this document makes that boundary crisp.

---

## Where AI IS Used

### 1. Root Cause Diagnosis

**Why AI**: Razorpay error codes are generic. `GATEWAY_ERROR` could mean 15 different things. AI interprets the error in context (time of day, bank, payment method, amount, pattern history) to produce an actionable diagnosis.

**Input to LLM**:
```
Payment failed:
- Error code: GATEWAY_ERROR
- Description: "Bank server not responding"
- Method: UPI (HDFC)
- Amount: ₹2,500
- Time: 23:45 IST
- Customer's last 3 attempts: all UPI, all failed in last 20 min
- Known context: HDFC UPI has scheduled maintenance 23:30-00:30
```

**Expected output**:
```json
{
  "root_cause": "bank_scheduled_maintenance",
  "confidence": 0.94,
  "reasoning": "HDFC UPI failures clustered around known maintenance window (23:30-00:30). Three consecutive failures from same bank confirms systemic issue, not customer-specific.",
  "recoverable": true,
  "recovery_hint": "Retry after maintenance window OR suggest alternate method immediately"
}
```

**Fallback if LLM unavailable**: Rule-based mapping (error_code → most common cause). Less accurate but functional.

---

### 2. Intervention Selection

**Why AI**: The "best" intervention depends on multiple factors that interact in non-obvious ways. A rule engine would need hundreds of rules; an LLM reasons over the combination naturally.

**Input to LLM**:
```
Diagnosis: bank_scheduled_maintenance (confidence: 0.94)
Context:
- Amount: ₹2,500 (low value)
- Method used: UPI
- Time now: 23:47 IST
- Maintenance ends: ~00:30 IST
- Customer has a saved card on file: yes
- Customer's typical payment method: UPI (80%), Card (20%)
- Attempt number: 1 of 3 allowed
- Order expiry: 2 hours from now

Available interventions:
1. Immediate retry (same method)
2. Delayed retry (same method, specify delay)
3. Alternate method suggestion (specify which)
4. Payment link (new link via SMS/email)
5. Customer nudge (message suggesting action)
```

**Expected output**:
```json
{
  "action": "alternate_method",
  "method": "card",
  "reasoning": "Bank maintenance is systemic — retrying UPI will fail again. Customer has saved card. Amount is low enough that card friction (OTP) is acceptable. Suggest card payment immediately rather than waiting 45min for maintenance to end.",
  "fallback_action": "delayed_retry",
  "fallback_delay_minutes": 45,
  "message_to_customer": "Your UPI payment couldn't go through right now. Want to try with your saved card instead? It'll take just a moment."
}
```

---

### 3. Customer Nudge Message Generation (P1)

**Why AI**: When the intervention is "nudge the customer," the message should be contextual — not a canned template. AI generates appropriate copy based on failure type, amount, and context.

**Note**: This is P1. For P0, customer nudge messages use simple templates. AI-generated messages come in if time allows.

---

### 4. Confidence Scoring

**Why AI**: Not all diagnoses are equal. The system needs to know when it's guessing vs when it's confident, to decide how aggressively to act.

- Confidence > 0.85 → proceed with recommended intervention
- Confidence 0.6-0.85 → proceed but flag for review
- Confidence < 0.6 → do NOT auto-intervene, log for manual review

---

## Where AI is NOT Used (Deliberate)

### 1. Stopping Rules — DETERMINISTIC

```javascript
// These are hard-coded. AI cannot override them.
function shouldStop(recoveryCase) {
  if (recoveryCase.attempts >= MAX_RETRIES) return { stop: true, reason: 'max_retries_exceeded' };
  if (recoveryCase.ageMs >= MAX_TIME_WINDOW) return { stop: true, reason: 'time_window_expired' };
  if (recoveryCase.nudgeCount >= MAX_NUDGES) return { stop: true, reason: 'nudge_limit_reached' };
  if (isQuietHours()) return { stop: true, reason: 'quiet_hours' };
  if (recoveryCase.amount > AMOUNT_CEILING) return { stop: true, reason: 'amount_requires_manual' };
  return { stop: false };
}
```

**Why not AI**: Stopping rules are compliance boundaries. They must be predictable, auditable, and never "creative." An LLM might rationalize "one more try" — that's exactly what we prevent.

### 2. API Execution — MECHANICAL

The actual retry, payment link creation, or invoice action is a direct API call. No intelligence needed — just follow the intervention selector's instructions.

**Why not AI**: Executing an API call doesn't benefit from reasoning. It's a function call with parameters.

### 3. Webhook Signature Verification — CRYPTOGRAPHIC

HMAC-SHA256 verification of Razorpay webhooks.

**Why not AI**: Security. This is math, not judgment.

### 4. Audit Logging — STRUCTURED

Every decision is logged with timestamp, stage, decision, reasoning. The logging itself is mechanical.

**Why not AI**: Audit trails must be complete and deterministic. Every event gets logged, no exceptions, no judgment about what's "worth logging."

### 5. Retry Interval Calculation — FORMULA-BASED

```javascript
function getRetryDelay(attemptNumber, baseDelay = 5 * 60 * 1000) {
  return baseDelay * Math.pow(2, attemptNumber - 1); // exponential backoff
}
```

**Why not AI**: Exponential backoff is a well-understood algorithm. AI adds no value and could introduce unpredictability.

### 6. Amount Formatting & Currency — UTILITY

Formatting ₹50,000 or calculating percentages.

**Why not AI**: Math is deterministic. Use code.

---

## LLM Configuration

### Model Choice

**Primary**: Claude Sonnet 5 (fast, excellent at structured output via tool_use, cost-effective)
**Fallback**: Rule-based engine (no LLM calls)

### Why tool_use Instead of Raw JSON Prompting

Instead of prompting "respond in JSON format" and parsing the output (fragile, requires validation, can hallucinate extra fields), we use Claude's **tool_use** feature:

- Define a tool schema that matches our expected output structure
- Claude returns structured data that's guaranteed to match the schema
- No JSON parsing errors, no prompt engineering around output format
- The "tool" is just our schema — we never actually call an external function

```javascript
// Example: Diagnosis as a tool_use call
const response = await anthropic.messages.create({
  model: 'claude-sonnet-5-20250514',
  max_tokens: 1024,
  temperature: 0.2,
  system: DIAGNOSIS_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: buildDiagnosisPrompt(failureEvent) }],
  tools: [{
    name: 'diagnose_failure',
    description: 'Classify the root cause of a payment failure',
    input_schema: {
      type: 'object',
      properties: {
        root_cause: {
          type: 'string',
          enum: ['bank_server_timeout', 'insufficient_funds', 'card_expired',
                 'upi_expired', 'network_error', 'rate_limit', 'fraud_suspected',
                 'invalid_details', 'bank_maintenance', 'unknown']
        },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reasoning: { type: 'string' },
        recoverable: { type: 'boolean' },
        suggested_wait_minutes: { type: 'number' }
      },
      required: ['root_cause', 'confidence', 'reasoning', 'recoverable']
    }
  }],
  tool_choice: { type: 'tool', name: 'diagnose_failure' }
});
```

This approach:
- Eliminates "please respond in JSON" prompt fragility
- Gives us typed, validated output every time
- Reduces prompt engineering effort significantly
- Makes the AI boundary clearer in code (tool schemas = AI contract)

### Prompt Engineering Priority

Prompt quality is **the #1 differentiator** in this project. The same architecture with bad prompts produces garbage diagnoses; with good prompts it produces genuinely useful interventions. Budget more time here than on UI.

**Iteration strategy**:
1. Start with 10 hand-crafted failure scenarios with known correct answers
2. Run diagnosis prompt against all 10, score accuracy
3. Iterate on system prompt until >85% accuracy on test set
4. Then do the same for intervention selection
5. Document prompt versions and accuracy metrics in audit

### Prompt Design Principles

1. **tool_use for structured output**: Never ask for raw JSON — use tool schemas
2. **Context window**: Keep prompts under 2K tokens (error context is small)
3. **System prompt**: One stable system prompt per function (diagnosis, intervention)
4. **Temperature**: 0.2 for diagnosis (want consistency)
5. **No chat history**: Each decision is independent — no multi-turn needed
6. **Constrained enums**: Root causes and interventions are finite lists — enforce via schema

### Cost Estimate (for hackathon)

- ~100 LLM calls for a batch of 50 failures (2 calls per: diagnosis + intervention)
- At Sonnet pricing (~$3/M input, $15/M output): well under $1 per full batch run
- Negligible for demo purposes

---

## Graceful Degradation

If the LLM is unavailable (API down, rate limited, timeout):

1. **Diagnosis fallback**: Error code → hardcoded mapping table
   ```
   GATEWAY_ERROR → "bank_timeout" (confidence: 0.5)
   BAD_REQUEST_ERROR → "customer_input_error" (confidence: 0.5)
   ```

2. **Intervention fallback**: Root cause → default action
   ```
   bank_timeout → delayed_retry (15 min)
   insufficient_funds → stop (not recoverable without customer action)
   card_expired → payment_link (customer must re-enter)
   ```

3. **Flag everything**: When in fallback mode, all decisions are flagged for review

This demonstrates the "failure recovery" criterion — even the AI agent handles its own failure gracefully.