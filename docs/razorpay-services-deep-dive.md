# Razorpay Services: Complete Map (Focused on Track 3 Relevance)

## The Big Picture

Razorpay is not just a payment gateway. It's a **full-stack financial infrastructure** with two sides:

```
MONEY IN (Razorpay)          MONEY OUT (RazorpayX)
─────────────────────         ─────────────────────
Payment Gateway               Current Accounts
Payment Links                 Payouts & Payout Links
Payment Pages/Buttons         Vendor Payments
QR Codes                      Payroll
Magic Checkout                Corporate Cards
Subscriptions                 Tax Payments
Smart Collect                 Escrow+ Accounts
Invoices                      Lending (Capital)
Route (Splits)                Forex/FDI
TokenHQ                       
Optimizer (Routing)           
International Payments        
POS (Offline)                 
```

---

## Service-by-Service Breakdown

### 1. Payment Gateway (Core Product)

**What it does**: Accepts payments via 100+ methods (Cards, UPI, Net Banking, Wallets, EMI, BNPL)

**How it works**:
1. Merchant creates an `order` via API → gets `order_id`
2. Customer sees Razorpay Checkout (hosted/embedded)
3. Customer picks payment method, enters details
4. Razorpay authenticates with customer's bank
5. On success → returns `payment_id` + `signature`
6. Merchant captures the payment (auto or manual)
7. Razorpay settles funds on T+2 cycle (or instant if opted in)

**Key states of a payment**:
- `created` → payment attempt initiated
- `authorized` → bank said yes, money blocked
- `captured` → merchant claimed the money
- `failed` → something went wrong
- `refunded` → money returned to customer

**Revenue recovery relevance**: Every `failed` payment is a lost sale. The gateway tells you WHAT failed but not WHY intelligently, and does nothing to recover it.

---

### 2. Magic Checkout

**What it does**: One-click checkout that reduces abandonment

**How it works**:
- Pre-fills customer info from Razorpay's network (address, phone, payment method)
- Uses 10,000+ data points to personalize the flow
- Biometric auth (passkeys) replaces OTP for cards
- Intelligent payment method prioritization based on history
- RTO protection: nudges risky COD buyers toward prepay

**Revenue recovery relevance**: Prevents abandonment BEFORE it happens. But once a customer drops off or a payment fails, Magic Checkout has no recovery mechanism. It's prevention, not recovery.

---

### 3. Subscriptions (Recurring Payments)

**What it does**: Automates recurring billing (SaaS, OTT, gym, etc.)

**How it works**:
- Merchant creates a `plan` (amount + interval)
- Customer subscribes via link → authorizes a mandate
- Razorpay auto-charges on schedule
- Supports: Cards (tokenized), UPI AutoPay, E-Mandate (NACH)

**Payment methods for mandates**:
- Cards: Tokenized via TokenHQ, RBI compliant
- UPI AutoPay: PhonePe, GPay, Paytm, BHIM, 40+ banks
- E-Mandate: Netbanking/debit card registration for NACH

**What happens on failure**:
- "Smart Payment Retries" — automatic retry logic (details undocumented publicly)
- Webhooks fire: `subscription.pending`, `subscription.halted`
- After exhausted retries → subscription halts
- Merchant can implement custom dunning via webhooks

**Revenue recovery relevance**: THIS IS A GOLDMINE. Failed subscription payments cause silent churn. Razorpay's retry logic is basic (fixed intervals, limited retries). There's no:
- Intelligent retry timing (based on when customer's bank is likely to approve)
- Multi-channel nudge (SMS → WhatsApp → email escalation)
- Alternate method fallback (card failed → try UPI AutoPay)
- Win-back flow for halted subscriptions

---

### 4. Payment Links

**What it does**: Shareable payment URLs via SMS/email/WhatsApp

**How it works**:
- Merchant creates a link (fixed amount or custom)
- Customer clicks → sees payment page → pays
- Supports partial payments, expiry dates, bulk creation (CSV upload)
- 180+ payment methods

**Revenue recovery relevance**: Payment links ARE a recovery tool. When a payment fails at checkout, merchants can manually send a payment link. But today this is:
- Manual (merchant has to create and send)
- Not personalized (generic link, no context about the failure)
- No smart timing (sent whenever merchant remembers)
- No automated follow-up sequence

An AI agent could automatically generate and send contextualized payment links after failures.

---

### 5. Smart Collect 2.0

**What it does**: Automated bank transfer collection + reconciliation

**How it works**:
- Merchant gets unique virtual account numbers / UPI IDs
- Assigns one per customer/invoice
- Customer sends money via NEFT/RTGS/IMPS/UPI to that identifier
- Razorpay auto-reconciles: who paid, how much, for what
- Real-time webhooks on receipt

**Use cases**: B2B payments, lending EMIs, rent, education fees, insurance premiums

**Revenue recovery relevance**: For B2B receivables and invoice-based businesses. When a customer hasn't paid their invoice, Smart Collect knows because no money arrived at the virtual account. But today there's no:
- Automated reminder sequence
- Escalation logic
- Promise-to-pay tracking
- Aging analysis with intelligent intervention

---

### 6. Invoices

**What it does**: GST-compliant invoice generation with embedded payment collection

**How it works**:
- Create invoice (line items, taxes, discounts, shipping)
- Send to customer → they click "Pay" inside the invoice
- Supports partial payments
- Multi-currency (100 currencies)

**Revenue recovery relevance**: Invoices that go unpaid are overdue receivables. Today Razorpay tracks outstanding invoices but doesn't:
- Auto-escalate overdue invoices
- Send intelligent reminders based on customer behavior
- Offer flexible payment plans dynamically
- Chase with Hinglish/vernacular communication

---

### 7. Route (Split Payments)

**What it does**: Splits payments between multiple parties (marketplaces, platforms)

**How it works**:
- Customer pays merchant
- Merchant transfers portions to linked accounts (sellers, vendors)
- Supports instant or deferred transfers
- Manages refunds across split parties

**Revenue recovery relevance**: When a payment in a marketplace fails, it affects both the platform AND the seller. Recovery needs to understand the split and recover for all parties.

---

### 8. TokenHQ (Card Tokenization)

**What it does**: Replaces card numbers with tokens for RBI compliance

**Key stat**: "4% increase in conversions" for businesses using saved cards

**How it works**:
- Customer's card → tokenized by network/issuer
- Token stored (not actual card number)
- Future payments use token → no re-entry needed
- 11 million+ saved cards in network

**Revenue recovery relevance**: When a tokenized card expires or is replaced, subscriptions/recurring payments fail silently. TokenHQ handles the token, but doesn't:
- Proactively detect upcoming card expirations
- Nudge customers to update payment methods BEFORE failure
- Auto-switch to alternate saved methods on failure

---

### 9. RazorpayX (Business Banking)

**What it does**: Outbound money movement — payouts, vendor payments, payroll

**Key stats**: $10B in payout volume (2024), 99.9% success rate, multi-bank routing

**How it works**:
- Current account with partner banks (RBL, Yes, Axis, ICICI)
- API-driven payouts (UPI, IMPS, NEFT, RTGS) — 24/7
- Bulk payouts (50,000 in one OTP)
- Vendor payments with OCR invoice processing
- AI agents for payout initiation via conversation

**Revenue recovery relevance**: The "money out" side. When a refund needs to go back to a customer (to maintain trust and enable re-purchase), RazorpayX processes it. Fast, reliable refunds → customer returns → recovered revenue.

---

## The Payment Failure Journey (Where Revenue Leaks)

Here's the lifecycle of a payment and every point where revenue can be lost:

```
Customer Intent → Checkout → Payment Attempt → Bank Processing → Settlement
     ↓                ↓            ↓                 ↓              ↓
  [LEAK 1]        [LEAK 2]     [LEAK 3]          [LEAK 4]      [LEAK 5]
  Abandonment     Drop-off     Failure           Timeout       Dispute/
  (never starts)  (UX friction) (declined)       (hung txn)    Chargeback
```

### LEAK 1: Checkout Abandonment (70-80% of carts)
- Customer adds to cart but never reaches payment
- Causes: price shock, trust deficit, complex form, no COD
- **Current Razorpay solution**: Magic Checkout (prevention only)
- **Gap**: No recovery after abandonment

### LEAK 2: Checkout Drop-off (15-20% of those who start)
- Customer opens payment form but quits
- Causes: too many steps, slow loading, no preferred method
- **Current Razorpay solution**: Checkout optimization, biometric auth
- **Gap**: No re-engagement for drop-offs

### LEAK 3: Payment Failure (15-25% of attempts)
- Customer tried to pay but it failed
- Causes:
  - **Bank-side**: Server timeout, insufficient funds, daily limit exceeded
  - **Network-side**: 3DS/OTP failure, session timeout, connectivity
  - **Card-side**: Expired, blocked, international not enabled
  - **UPI-side**: VPA incorrect, bank server down, collect request expired
- **Current Razorpay solution**: Shows "Payment failed, try again" message
- **Gap**: No intelligent retry, no root-cause-based intervention, no alternate method suggestion

### LEAK 4: Recurring Payment Failure
- Scheduled payment didn't go through
- Causes: Card expired, mandate revoked, insufficient funds, bank downtime
- **Current Razorpay solution**: Basic retry logic (fixed intervals)
- **Gap**: No intelligent timing, no multi-channel communication, no method switching

### LEAK 5: Post-Payment Loss (Chargebacks/Disputes)
- Payment succeeded but money clawed back later
- Causes: Friendly fraud, merchant didn't deliver, card stolen
- **Current Razorpay solution**: Manual dispute portal
- **Gap**: No AI-powered evidence compilation, no pattern detection

---

## What Track 3 Wants You to Build

Looking at the track description again:

> "Build an agent that detects revenue at risk, determines the right intervention, and executes a bounded recovery workflow: from payment failures and checkout abandonment to overdue receivables."

### The 7 Example Directions Explained:

| Direction | What It Means | Which Razorpay Service It Touches |
|-----------|--------------|----------------------------------|
| Payment degradation → root cause → recovery action | Detect when success rate drops, figure out why, fix it | Payment Gateway, Webhooks |
| Checkout drop-off recovery | Re-engage customers who abandoned payment | Magic Checkout, Payment Links |
| Failed-subscription recovery | Recover failed recurring payments intelligently | Subscriptions, TokenHQ |
| B2B receivables chaser | Chase unpaid invoices/transfers automatically | Smart Collect, Invoices |
| Mandate retry sequencer | Optimize when/how to retry UPI AutoPay/NACH mandates | Subscriptions, UPI AutoPay |
| Hinglish voice recovery | Call/message customers in Hindi-English mix to recover | Payment Links + Communication |
| Promise-to-pay tracker | Track verbal/digital commitments and follow up | Smart Collect, Invoices |

---

## The APIs You'd Actually Use (Test Mode)

For your hackathon build, these are the Razorpay APIs relevant to Track 3:

| API | Purpose in Your Agent |
|-----|----------------------|
| Orders API | Create test orders that will "fail" |
| Payments API | Fetch payment details, check status, see failure reason |
| Payment Links API | Create recovery payment links programmatically |
| Subscriptions API | Create test subscriptions, simulate failures |
| Invoices API | Create invoices, track payment status |
| Webhooks | Listen for `payment.failed`, `subscription.halted`, `invoice.expired` |
| Refunds API | Process refunds as part of recovery (refund → re-attempt) |

**Test mode**: All Razorpay APIs work in test mode with `rzp_test_*` keys. You can simulate failures without real money.

---

## Key Insight for Your Build

Razorpay gives merchants the **data** (via webhooks and APIs) to know when something fails. But they don't give merchants the **intelligence** to know:

1. **WHY** it failed (beyond a generic error code)
2. **WHAT** to do about it (which intervention works for this specific failure type)
3. **WHEN** to do it (optimal timing for retry/nudge)
4. **HOW** to communicate (channel, language, tone based on customer profile)
5. **WHEN TO STOP** (compliance limits, customer annoyance threshold)

**Your agent fills this gap.** It sits between Razorpay's event stream and the merchant's recovery actions, adding intelligence to what is currently a dumb pipe.
