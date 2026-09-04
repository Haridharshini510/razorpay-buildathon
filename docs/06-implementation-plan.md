# Implementation Plan: AI Revenue Recovery Agent

## 7-Day Schedule

---

## Day 1: Project Setup + Core Infrastructure + Tests

### Morning: Scaffolding

- [x] Initialize Next.js app with App Router:
  ```
  npx create-next-app@latest . --typescript --tailwind --app --src-dir
  ```
- [x] Set up MongoDB connection (Mongoose) — local Docker or Atlas free tier
- [x] Set up Redis (local Docker) + BullMQ
- [x] Create Mongoose models (recovery_cases, audit_logs, batches, system_config)
- [x] Set up `.env.local` with Razorpay test keys + Gemini API key
- [x] Install dependencies: `razorpay`, `mongoose`, `@google/generative-ai`, `bullmq`, `ioredis`
- [x] Set up `docker-compose.yml` for MongoDB + Redis

### Afternoon: Core Pipeline + Stopping Rules + Tests

- [x] Build Recovery Orchestrator — the main state machine:
  - Receives event → creates recovery case → runs pipeline → updates status
  - Status transitions: received → diagnosing → intervening → waiting_retry → resolved/stopped/failed
- [x] Build Stopping Rules Engine (deterministic):
  - `shouldStop(recoveryCase)` — checks all rules, returns {stop, reason}
  - All rules from config, no AI involvement
- [x] **Unit tests for stopping rules** (critical — demonstrates build quality):
  - Test each rule triggers at boundary
  - Test combinations (multiple rules checked)
  - Test that passing case returns {stop: false}
- [x] Build Audit Logger:
  - `logDecision(caseId, stage, decision, reasoning, aiUsed)`
  - Append-only, never updates past logs
- [x] Set up BullMQ queue + worker skeleton:
  - `recoveryQueue` — processes recovery jobs
  - Worker picks up jobs and runs through orchestrator
- [x] Seed system_config with default stopping rules

### End of Day 1 Checkpoint:
- Next.js app running with API routes accessible
- MongoDB + Redis connected via Docker
- Orchestrator skeleton processes a hardcoded event through the pipeline
- Stopping rules work in isolation **with passing unit tests**
- BullMQ queue accepts and processes jobs
- Audit log captures decisions

---

## Day 2: AI Engines (Diagnosis + Intervention) — PROMPT QUALITY FOCUS

### Morning: Diagnostic Engine

- [x] Set up Gemini SDK client
- [x] Define structured output schema for `diagnose_failure`:
  - Constrained enum for root_cause
  - confidence (0-1), reasoning, recoverable, suggested_wait_minutes
- [x] Write system prompt for root cause diagnosis (this is the critical prompt — iterate)
- [x] Build `diagnose(failureEvent)` function:
  - Constructs user message from event data
  - Calls Gemini with JSON-only prompt
  - Returns typed diagnosis object
- [x] Build fallback diagnosis (rule-based mapping) for when LLM is unavailable
- [x] **Create test suite: 10 hand-crafted failure scenarios with expected diagnoses**
- [x] Run diagnosis against all 10 scenarios, score accuracy
- [x] Iterate on system prompt until >85% accuracy on test set

### Afternoon: Intervention Selector

- [x] Define structured output schema for `select_intervention`:
  - action enum: immediate_retry, delayed_retry, alternate_method, payment_link, customer_nudge, stop
  - method, delay_minutes, reasoning, fallback_action
- [x] Write system prompt for intervention selection
- [x] Build `selectIntervention(diagnosis, context)` function:
  - Constructs prompt with diagnosis + context
  - Calls Gemini with JSON-only prompt
  - Validates output against allowed actions
  - Returns intervention plan
- [x] Build fallback intervention selection (root_cause → default action mapping)
- [x] **Test suite: 10 scenarios with expected interventions** (pair with diagnosis test set)
- [x] Iterate on intervention prompt until selections are reasonable
- [x] Integrate both engines into Recovery Orchestrator pipeline
- [x] End-to-end test: hardcoded failure → diagnosis → intervention selection → audit log

### End of Day 2 Checkpoint:
- Diagnosis engine produces accurate root causes (>85% on test set)
- Intervention selector picks reasonable actions
- Full pipeline runs: event → diagnose → select intervention → log
- Fallbacks work when LLM client throws
- Prompt quality documented with accuracy metrics

---

## Day 3: Execution Engine + Razorpay Integration + Delayed Retries

### Morning: Razorpay API Integration

- [x] Set up Razorpay SDK with test keys
- [x] Build execution functions:
  - `retryPayment(orderId, method)` — create new payment attempt
  - `createPaymentLink(amount, customer, description)` — generate recovery link
  - `createOrder(amount, currency)` — new order for alternate method attempt
- [x] Build webhook receiver API route (`POST /api/webhooks/razorpay`):
  - Signature verification
  - Event parsing (payment.failed)
  - Enqueue to BullMQ
- [x] Set up ngrok for webhook testing

### Afternoon: Execution Engine + BullMQ Delayed Jobs

- [x] Build Execution Engine:
  - Takes intervention plan → maps to correct Razorpay API call → executes
  - Captures result (success/failure + details)
  - Updates recovery case with intervention result
- [x] Wire delayed retries through BullMQ:
  - Intervention says "delayed_retry, 15 min" → enqueue job with 15min delay
  - Worker picks up delayed job → runs execution → updates case
  - If execution fails → check stopping rules → maybe enqueue next attempt
- [x] Handle execution failures (Razorpay API errors):
  - Log the failure
  - Don't crash the pipeline
  - Mark intervention as "execution_failed"
- [x] Handle simulation layer:
  - Since Razorpay test mode can't truly simulate "retry succeeds after timeout," build a thin simulation layer
  - Based on root cause + time elapsed, simulate whether retry would succeed
  - Log clearly: "simulated outcome" vs "real API call"
- [x] Test: Trigger a webhook → watch full pipeline run → see result in DB

### End of Day 3 Checkpoint:
- Razorpay test-mode APIs working (can create orders, payment links)
- Webhook receiver enqueues events to BullMQ
- Delayed retries work via BullMQ (job fires after delay)
- Full pipeline works end-to-end
- Execution failures handled gracefully
- Simulation layer produces realistic outcomes

---

## Day 4: Batch Processing + Dashboard Setup

### Morning: Batch Processor + Simulation

- [x] Build `POST /api/batch/process` API route:
  - Accepts array of failure events
  - Creates batch record
  - Enqueues each event as a BullMQ job (with 1s stagger to avoid LLM rate limits)
  - Returns batch_id immediately
- [x] Build `GET /api/batch/:id` API route:
  - Returns batch status, results, breakdown
  - Computed from recovery_cases with matching batch_id
- [x] Build simulation endpoint (`POST /api/simulate`):
  - Generates realistic failure events with configurable distribution
  - Randomizes: amounts (₹500-₹1L), methods, error types, banks, timestamps
  - Enqueues as batch for processing via BullMQ (with direct fallback)
- [x] Build BullMQ event listener to update batch status as jobs complete
- [x] Test: Generate 50 failures → batch process → verify recovery rate is reasonable

### Afternoon: Dashboard Foundation (Next.js Pages)

- [x] Install Recharts for chart components
- [x] Build app layout: sidebar navigation, main content area
- [x] Build Metrics Dashboard page (`/dashboard`):
  - Recovery rate (big number, stat card)
  - Donut chart: recovered vs stopped vs failed
  - Bar chart: recovery rate by failure type
  - Total amount recovered (formatted ₹)
  - Cards: total processed, avg time to recovery
- [x] Build Batch List page (`/batches`):
  - Table of batch runs with status, recovery rate, timestamp
  - Click → batch detail page
- [x] Connect pages to API routes (client components with polling)

### End of Day 4 Checkpoint:
- Batch processing works for 50+ events via BullMQ
- Simulation generates realistic failure distributions
- Dashboard shows real metrics from processed batches
- "Run Simulation" triggers a batch and results appear on dashboard

---

## Day 5: Recovery Timeline + Audit Log + Bull Board

### Morning: Recovery Case Detail View

- [x] Build Recovery Timeline page (`/recoveries/[id]`):
  - Vertical timeline showing each step of the recovery
  - Event → Diagnosis → Stopping Check → Intervention → (Wait) → Execution → Outcome
  - Each step shows: timestamp, decision, reasoning
  - Badge: "AI" (blue) vs "Deterministic" (grey) for each step
  - Color-coded: green (success), red (failed), yellow (waiting), grey (stopped)
- [x] Build Recoveries List page (`/recoveries`):
  - Filterable table: by status, by root cause, by batch
  - Click row → timeline detail
- [x] Build Batch Detail page (`/batches/[id]`):
  - Summary stats for that batch
  - Distribution chart
  - List of recovery cases in batch with outcomes

### Afternoon: Audit Log + Observability

- [x] Build Audit Log page (`/audit`):
  - Table: timestamp, case, stage, decision, AI badge
  - Filter by: stage, AI/non-AI, case_id
  - Expandable rows showing full reasoning + context
- [ ] Set up Bull Board at `/admin/queues`:
  - Shows queue health, pending/delayed/completed jobs
  - Visible in demo as observability proof
- [x] Build "Run Simulation" button prominently in dashboard:
  - Click → modal with distribution config → starts batch → polls for results
  - Shows progress (X/50 processed) while running
- [x] Add graceful degradation indicator:
  - When fallback_used: true in a diagnosis → show "Fallback Mode" badge in UI

### End of Day 5 Checkpoint:
- Full recovery journey visible as timeline
- Audit log searchable and shows AI vs deterministic decisions
- Bull Board shows queue state
- "Run Simulation" works as a single click from dashboard
- UI tells the complete story of how the agent makes decisions

---

## Day 6: Polish + Edge Cases + Graceful Degradation Demo

### Morning: Edge Cases + Testing

- [ ] Test graceful degradation end-to-end:
  - Set invalid API key → run batch → verify fallback activates
  - Dashboard shows "Fallback Mode" badges on affected cases
  - Audit log shows fallback_used: true with lower confidence
  - Recovery still happens (just less accurate)
- [~] Test stopping rules in practice: *(PARTIAL — unit tests exist in tests/stoppingRules.test.ts, but no documented full-system verification)*
  - Create scenario where max_retries triggers → verify case stops
  - Create scenario where quiet_hours triggers → verify no nudge sent
  - Create scenario where amount_ceiling triggers → verify manual flag
  - Verify each stopped case explains WHY in audit log
- [ ] Test with 100-event batch — verify performance (no timeouts, queue drains)
- [ ] Test the "meta-failure" scenario:
  - What if BullMQ worker crashes mid-batch? (Jobs stay in queue, re-process on restart)
  - What if MongoDB is slow? (Audit logs still written, just delayed)

### Afternoon: UI Polish + Demo Readiness

- [~] Add error states in UI (API errors, empty states, loading skeletons) *(PARTIAL — empty state + loading spinner exist, but no error states or skeletons)*
- [ ] Add "Export Audit" button (download JSON for a batch)
- [ ] Show stopping rules configuration in dashboard (what the limits are)
- [~] Polish metric formatting (₹ with commas, percentages, time durations) *(PARTIAL — ₹ with toLocaleString works, no percentage/duration formatting)*
- [~] Ensure mobile doesn't break (basic responsiveness) *(PARTIAL — some responsive grid, minimal)*
- [ ] Run 3 different batch distributions, verify varied results
- [ ] Fix any bugs found during testing

### End of Day 6 Checkpoint:
- Graceful degradation works and is **visibly demonstrated**
- Stopping rules demonstrably prevent over-recovery
- 100-event batch processes cleanly
- UI is clean, tells a clear story, no crashes
- Edge cases handled (not just the happy path)

---

## Day 7: Demo Prep + Final Testing + Documentation

### Morning: Final Integration Testing

- [ ] Run full demo scenario end-to-end:
  1. Start with empty system (docker-compose up)
  2. Click "Run Simulation" with 50 events
  3. Watch dashboard update as agent processes
  4. Click into recovered case → show AI reasoning timeline
  5. Click into stopped case → show WHY it stopped
  6. Show audit log → filter by AI vs deterministic
  7. Show Bull Board → queue health
  8. Simulate LLM failure → show graceful fallback
- [ ] Verify the "meta-failure" case and screenshot it
- [ ] Run 3 different batch distributions and screenshot results
- [ ] Verify audit trail is complete (every decision logged, no gaps)

### Afternoon: Documentation + Submission

- [x] Write README.md:
  - What this is (1 paragraph)
  - How to run it (`docker-compose up` + `npm run dev`)
  - Architecture diagram (text)
  - Key design decisions:
    - AI boundary (what's AI, what's not, and WHY)
    - BullMQ for delayed retries (why not setTimeout)
    - Gemini for structured AI output with JSON-constrained prompts
    - Stopping rules are never AI-overridable
  - Demo instructions (single "Run Simulation" click)
  - Results from test runs (screenshots + metrics)
  - Prompt accuracy metrics (diagnosis test suite results)
- [ ] Document failures honestly:
  - What didn't work as expected
  - What the agent gets wrong (which failure types it struggles with)
  - Limitations of simulation layer
  - What you'd improve with more time
- [~] Clean up code: *(PARTIAL — .env.example exists, docker-compose.yml exists, but dead code/console.log cleanup not done)*
  - Remove dead code, console.logs
  - Ensure `.env.example` exists (no actual keys committed)
  - Verify `docker-compose up && npm run dev` works from fresh clone
- [ ] Final commit + submission

### End of Day 7:
- Everything works from a fresh clone
- Documentation is honest and complete
- Demo scenario is rehearsed and reliable (single click)
- Submission ready

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| LLM API rate limits during batch | BullMQ job stagger (1s delay between enqueues); fallback to rules on 429 |
| Razorpay test mode can't simulate recovery | Thin simulation layer with realistic probabilities; clearly documented |
| Dashboard takes too long | Use Tremor pre-built components. Priority: metrics + timeline. Audit log can be a basic table. |
| Prompt quality is poor | Dedicated test suite of 10 scenarios. Iterate on Day 2 until >85%. Don't move on until this is solid. |
| Scope creep | B2B is P1. If Day 5 finishes early, consider adding it. Otherwise, ship without it. |
| Redis/Docker issues on Windows | Fall back to Upstash Redis (free tier, cloud-hosted) if local Docker has issues |

## File Structure (Final)

```
razorpay-buildathon/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  — Redirect to /dashboard
│   │   ├── dashboard/
│   │   │   └── page.tsx              — Metrics overview
│   │   ├── batches/
│   │   │   ├── page.tsx              — Batch list
│   │   │   └── [id]/page.tsx         — Batch detail
│   │   ├── recoveries/
│   │   │   ├── page.tsx              — Recovery case list
│   │   │   └── [id]/page.tsx         — Recovery timeline
│   │   ├── audit/
│   │   │   └── page.tsx              — Audit log
│   │   ├── admin/
│   │   │   └── queues/page.tsx       — Bull Board embed
│   │   └── api/
│   │       ├── webhooks/
│   │       │   └── razorpay/route.ts — Webhook receiver
│   │       ├── batch/
│   │       │   ├── process/route.ts  — Start batch
│   │       │   └── [id]/route.ts     — Get batch status
│   │       ├── recoveries/
│   │       │   ├── route.ts          — List recoveries
│   │       │   └── [id]/route.ts     — Get single recovery
│   │       ├── audit/route.ts        — Query audit log
│   │       ├── metrics/route.ts      — Dashboard metrics
│   │       └── simulate/route.ts     — Generate test failures
│   ├── lib/
│   │   ├── db.ts                     — MongoDB/Mongoose connection
│   │   ├── redis.ts                  — Redis/BullMQ connection
│   │   ├── gemini.ts                 — Gemini client setup
│   │   └── razorpay.ts              — Razorpay SDK setup
│   ├── models/
│   │   ├── RecoveryCase.ts
│   │   ├── AuditLog.ts
│   │   ├── Batch.ts
│   │   └── SystemConfig.ts
│   ├── services/
│   │   ├── orchestrator.ts           — Main recovery pipeline
│   │   ├── diagnosticEngine.ts       — AI root cause diagnosis (Gemini)
│   │   ├── interventionSelector.ts   — AI intervention choice (Gemini)
│   │   ├── executionEngine.ts        — Razorpay API calls + simulation
│   │   ├── stoppingRules.ts          — Deterministic gates
│   │   ├── auditLogger.ts            — Append-only logging
│   │   └── simulationLayer.ts        — Realistic outcome simulation
│   ├── workers/
│   │   └── recoveryWorker.ts         — BullMQ worker (processes recovery jobs)
│   ├── components/
│   │   ├── MetricCard.tsx
│   │   ├── RecoveryChart.tsx
│   │   ├── TimelineStep.tsx
│   │   ├── AuditEntry.tsx
│   │   └── SimulationModal.tsx
│   └── prompts/
│       ├── diagnosis.ts              — System prompt + tool schema for diagnosis
│       └── intervention.ts           — System prompt + tool schema for intervention
├── tests/
│   ├── stoppingRules.test.ts         — Unit tests for stopping rules
│   ├── diagnosis.test.ts             — Test scenarios for AI diagnosis accuracy
│   └── intervention.test.ts          — Test scenarios for intervention selection
├── docker-compose.yml                — MongoDB + Redis
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
├── .env.example
├── .gitignore
└── README.md
```

## Definition of Done (Submission Criteria)

- [ ] Agent processes a batch of 50+ failures with different root causes
- [ ] Recovery rate is measured and reported (target: >60%)
- [ ] Each decision has an audit trail with reasoning
- [ ] Stopping rules prevent over-recovery (demonstrably, with specific examples)
- [ ] AI diagnosis accuracy >85% on test suite (documented)
- [ ] Dashboard tells a clear story (single "Run Simulation" click for demo)
- [ ] System handles its own failures gracefully (LLM down → fallback, visibly demonstrated)
- [ ] Code runs from fresh clone with `docker-compose up && npm run dev`
- [ ] Failures are documented honestly
- [ ] Unit tests pass for stopping rules
