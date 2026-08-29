# Razorpay Buildathon: Strategic Research & Track Analysis

## What This Hackathon Actually Is

This is NOT a typical hackathon. It's a **6-12 month paid internship selection** (₹75,000/month, Bangalore, starting September). No resume, no aptitude test — your code IS your application. They want builders who think like product engineers, not competitive programmers.

---

## What They Value (Ranked by Importance)

| Criterion | What It Really Means | How to Win |
|-----------|---------------------|------------|
| **Problem Taste** | Did you pick something that *actually matters* to Razorpay's business? | Show you understand their revenue model and pain |
| **Build Quality** | Does it run? Is it structured? Would you trust it in prod? | Clean code, working demo, honest error states |
| **AI Judgment** | Right tool, right place — and where you chose NOT to use AI | Don't slap GPT on everything. Show restraint. |
| **Failure Recovery** | What broke and what you did about it | Document failures honestly. Show graceful degradation. |

**Key insight**: They explicitly say "We read the work, not the resume." The judging is about *taste* and *engineering maturity*, not flashiness.

---

## Razorpay: Company Overview

- **Founded**: 2014, IIT Roorkee alumni (Harshil Mathur, Shashank Kumar)
- **Valuation**: ~$7.5B (last round)
- **Scale**: 50 lakh+ businesses, RBI-authorized payment aggregator
- **Investors**: Sequoia, Y Combinator, Tiger Global, GIC, Lightspeed
- **Core Products**: Payment Gateway, RazorpayX (Banking), Razorpay Capital (Lending), Payroll, POS
- **Competitors**: PayU, Cashfree, Juspay, PhonePe (merchant), Stripe (international)

---

## Razorpay's Current Strategic Direction (2025-2026)

### Where They're Betting Big RIGHT NOW:

1. **AI-Native Payments / Agentic Commerce** — Their #1 bet
   - Launched "Agent Studio" — world's first AI-powered payment platform
   - Agentic payments on Claude (Anthropic partnership)
   - NPCI collaboration for agent-to-agent payments
   - Powering Zomato, Swiggy, Zepto conversational transactions
   - Partnership with Sarvam AI for voice-first commerce
   - Payment CLI built "for developers and the AI agent era"
   - Replit partnership for global AI developer payments

2. **International Expansion**
   - Apple Pay for Indian merchants
   - Cross-border rate optimization
   - Google Pay card payments (first Indian PA to do it)

3. **Biometric/Passkey Authentication**
   - RBI-compliant biometric passkeys with Mastercard & Visa

4. **AI Banking (RazorpayX)**
   - AI agents that initiate payouts via conversation
   - Payroll AI agents for approvals

---

## Industry Pain Points (What Actually Hurts Razorpay & Their Merchants)

### 1. Payment Failures — THE #1 Problem in Indian Digital Payments
- **India's average payment failure rate: 15-25%** depending on method
- UPI failures: ~10-15% (bank server timeouts, daily limits, VPA issues)
- Card failures: ~20-30% (OTP drops, bank declines, 3DS failures)
- Net banking: ~25-35% (session timeouts, bank downtime)
- **Revenue lost per year across India**: Estimated ₹10,000-15,000 Cr in abandoned transactions due to failures
- Razorpay's own marketing emphasizes "high success rates" without publishing exact numbers — a competitive vulnerability

### 2. Checkout Abandonment
- **Indian e-commerce abandonment rate: 70-80%**
- Top causes: payment failure, redirect friction, OTP delays, trust deficit
- Razorpay launched "Magic Checkout" to address this but it's still opt-in and limited
- Each 1% improvement in conversion = massive merchant revenue

### 3. Chargebacks & Disputes
- Rising 15-20% YoY in India
- Digital goods, food delivery, subscription services most affected
- Merchants lose the chargeback + penalty fee + goods/service already delivered
- Current tools are largely manual evidence submission portals
- **Razorpay has NO public AI-powered chargeback defense product**

### 4. Returns & Refund Abuse
- Fashion e-commerce: 25-40% return rates
- "Wardrobing" (buy, use, return) costs merchants billions
- COD order frauds and address manipulation
- No automated scoring or prevention at payment gateway level

### 5. Reconciliation & Settlement
- Many merchants still reconcile in Excel
- Multiple payment methods = multiple settlement files = chaos
- "Verification capacity, not generation speed, is the bottleneck" (Razorpay's own words in Track 04)
- T+2 or T+3 settlement cycles create cash flow uncertainty
- Tax compliance (GST matching) is still largely manual

### 6. Subscription & Recurring Payment Failures
- Mandate failures when bank changes/card expires
- Silent churn: customer didn't actively cancel, payment just stopped working
- Recovery rates for failed recurring payments: industry average ~10-20%
- Smart retry logic exists but is basic (fixed intervals, no ML optimization)

### 7. Fraud Acceleration
- AI-generated deepfake KYC documents
- Synthetic identity fraud for merchant onboarding
- Card testing attacks (small txn floods)
- UPI fraud via social engineering (not tech, but volume is exploding)
- AI-enabled fraud is growing faster than AI-enabled defense

---

## What Razorpay LACKS Today (Gaps by Track)

### Track 01 — AI Growth & Agentic Commerce
**Current state**: Agent Studio launched, Claude integration live, NPCI pilots running
**Gap**: This is their NEWEST and most invested area. Agent-readable catalogs, conversational checkout, and cross-sell agents are still in early stages.
**Reality check**: They already have a team working on this. A hackathon project here competes with their own roadmap.

### Track 02 — AI Risk Manager
**Current state**: Basic fraud detection, chargeback management portal (manual)
**Gaps**:
- No public AI-powered chargeback evidence generator
- No real-time return-risk scoring at payment time
- No abuse-ring detection (connected accounts, same device, multiple returns)
- Fraud spike detection exists but is rule-based, not ML-adaptive
- **They have the DATA but lack intelligent automation on top of it**

### Track 03 — AI Revenue Recovery
**Current state**: Basic payment retry (Smart Collect), webhook notifications for failures
**Gaps**:
- No intelligent root-cause diagnosis for payment failures
- No dynamic intervention selection (when to retry vs. when to nudge vs. when to offer alternate method)
- No Hinglish/vernacular recovery communication
- No promise-to-pay tracking for B2B receivables
- Checkout drop-off recovery is done by merchants themselves, not Razorpay
- Subscription failure recovery is basic (fixed retry intervals)
- **This is where money literally falls through the cracks every day**

### Track 04 — AI Finance Controller
**Current state**: Dashboard analytics, basic settlement reports
**Gaps**:
- Reconciliation is still largely Excel-based for merchants
- No multi-source auto-reconciliation (bank + gateway + accounting software)
- No AI-driven exception handling for mismatches
- Cash forecasting doesn't exist as a product
- Tax-line matching (GST/TDS) is manual nightmare for merchants
- "Verification capacity is the bottleneck" — their own admission

---

## What Users Actually Complain About (Synthesized from Reviews, Forums, Social)

### Merchant Complaints (Most Frequent → Least):
1. **Settlement delays** — money stuck, unclear timelines, poor communication
2. **Account freezes** — sudden holds with no explanation, weeks to resolve
3. **Payment success rate drops** — intermittent degradation with no alerts
4. **Chargeback handling** — merchants feel defenseless, burden of proof is on them
5. **Support quality** — bot-first, slow escalation, generic responses
6. **Reconciliation difficulty** — mismatches between dashboard and bank statements
7. **Integration complexity** — docs are good but edge cases are undocumented
8. **Refund delays** — customers blame merchants, merchants blame Razorpay

### Developer Complaints:
1. Webhook reliability during high-traffic events
2. Test mode doesn't perfectly simulate production failures
3. Rate limiting during flash sales
4. Incomplete error codes (generic "payment failed" without actionable detail)

---

## Strategic Recommendation: PICK TRACK 03 — AI Revenue Recovery

### Why Track 03 is the Winning Choice:

**1. Problem Taste (Maximum Signal)**
- Revenue recovery is the most *financially measurable* problem
- Every ₹1 recovered = direct merchant value = direct Razorpay revenue (they take a cut)
- It's the intersection of their biggest complaint categories (payment failures, settlement, support)
- It's NOT their flashiest investment area (that's Track 01), meaning fewer internal resources are already on it
- It has the most "example directions" (7!) — they're practically begging someone to solve this

**2. Build Quality (Most Demonstrable)**
- You can build a working agent that: detects failure → diagnoses root cause → picks intervention → executes recovery
- You can show REAL metrics: "recovered X out of Y failed payments in test set"
- The "bounded recovery workflow" requirement is achievable in hackathon timeframe
- Clear audit trail requirement = you build with observability from day 1

**3. AI Judgment (Best AI/Non-AI Balance)**
- AI FOR: root cause classification, intervention selection, timing optimization, Hinglish communication
- AI NOT FOR: the actual retry (that's an API call), compliance checks (rule-based), stop rules (deterministic)
- This naturally demonstrates "where you chose not to use AI"

**4. Failure Recovery (Built Into the Problem)**
- The entire track IS about recovering from failures
- Your demo naturally shows: "payment failed → agent diagnosed timeout → chose to retry after 30s → succeeded"
- You can also show: "agent detected rate limit → chose NOT to retry → escalated to alternate method"
- Meta-failure: "what happens when YOUR recovery agent fails?" — graceful degradation built in

**5. Razorpay's Actual Business Need**
- Indian payment failure rate of 15-25% × Razorpay's 50L merchants = BILLIONS in recoverable revenue
- Every 1% improvement in recovery = massive TAM
- Their own blog has almost NO content on revenue recovery — it's an underinvested area
- Their existing retry logic is basic and unintelligent
- Merchants are ALREADY asking for this (settlement complaints, payment failure complaints)

**6. Competition Factor**
- Track 01 (Agentic Commerce) will attract the most flashy/trendy submissions
- Track 02 (Risk) requires ML expertise and labeled fraud datasets — higher bar
- Track 04 (Finance Controller) is niche and requires accounting domain knowledge
- Track 03 is the sweet spot: real problem, achievable scope, high impact, moderate competition

---

## Track 03: What a Winning Submission Looks Like

### The Bar (from their site):
> "Measured money recovered across a batch, with compliant escalation, stopping rules, and an audit trail"

### Recommended Build: "Payment Failure Recovery Agent"

**Core Loop:**
1. **Detect** — Monitor payment events for failures (via webhook simulation)
2. **Diagnose** — Classify failure root cause (bank timeout vs. insufficient funds vs. OTP drop vs. rate limit)
3. **Decide** — Pick optimal intervention:
   - Immediate retry (bank timeout)
   - Delayed retry with backoff (rate limit)
   - Alternate method suggestion (card → UPI fallback)
   - Customer nudge via SMS/WhatsApp (OTP drop, insufficient funds)
   - Do nothing + mark for manual review (suspicious pattern)
4. **Execute** — Run the intervention via Razorpay test-mode APIs
5. **Track** — Log every decision with reasoning, maintain audit trail
6. **Stop** — Enforce stopping rules (max retries, time window, compliance limits)

### What Makes It Stand Out:
- Run on a batch of 50+ simulated failures with different root causes
- Report: "Recovered 34/50 payments, 68% recovery rate, 0 compliance violations"
- Show the 16 it DIDN'T recover and explain why it correctly stopped
- Show one failure of your OWN system and how it handled it gracefully
- Hinglish customer communication for nudge messages (bonus points)

---

## Why NOT the Other Tracks

| Track | Risk Factor |
|-------|------------|
| 01 — Agentic Commerce | Razorpay already has a team + Agent Studio on this. You're building a worse version of what they're shipping. High competition from trendy AI submissions. |
| 02 — Risk Manager | Needs labeled fraud data you don't have. "Measured precision and recall on a held-out test set" requires real ML rigor. False-positive cost is hard to demonstrate. |
| 04 — Finance Controller | Requires deep accounting domain knowledge (GST, TDS, bank reconciliation formats). Niche. Less emotionally compelling than "we recovered ₹X." |
| 05 — Open Track | High risk — they might not have a clear rubric for it. Safer to pick a defined track. |

---

## Summary

| Dimension | Razorpay Today | What They Need |
|-----------|---------------|----------------|
| Market Position | #1 payment gateway in India by merchant count | Defend against Cashfree/Juspay on success rates |
| Revenue Model | 2% per transaction + platform fees | Every failed payment = lost commission |
| Biggest Pain | Payment failures (15-25% failure rate) | Intelligent, automated recovery |
| Strategic Bet | AI-native agentic commerce | But revenue recovery is the unsexy foundation that makes it work |
| Underinvested Area | Revenue recovery, reconciliation | They admit it: "still done by hand" |
| What Merchants Scream About | Settlements, failures, chargebacks | Give them money back automatically |

**Pick Track 03. Build a revenue recovery agent. Show measured results on a realistic batch. Document your failures honestly. Win.**
