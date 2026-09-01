import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { connectDB } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { enqueueBatchEvents } from "@/lib/redis";
import { processRecoveryEvent, PaymentFailureEvent } from "@/services/orchestrator";

interface FailureProfile {
  error_code: string;
  error_descriptions: string[];
  methods: string[];
  recoverable: boolean;
  weight: number;
}

const FAILURE_PROFILES: FailureProfile[] = [
  {
    error_code: "GATEWAY_ERROR",
    error_descriptions: [
      "Payment was unsuccessful as the bank server is not responding",
      "Payment processing failed due to bank server timeout",
      "Transaction timed out at bank gateway",
    ],
    methods: ["upi", "netbanking", "card"],
    recoverable: true,
    weight: 25,
  },
  {
    error_code: "BAD_REQUEST_ERROR",
    error_descriptions: [
      "Insufficient account balance",
      "Your account does not have enough balance to make this payment",
    ],
    methods: ["card", "netbanking"],
    recoverable: false,
    weight: 20,
  },
  {
    error_code: "GATEWAY_ERROR",
    error_descriptions: [
      "Your payment could not be completed as the UPI transaction expired",
      "UPI collect request timed out",
      "Customer did not respond to the UPI collect request",
    ],
    methods: ["upi"],
    recoverable: true,
    weight: 15,
  },
  {
    error_code: "BAD_REQUEST_ERROR",
    error_descriptions: [
      "The card has expired",
      "Card is expired or invalid",
    ],
    methods: ["card"],
    recoverable: true,
    weight: 10,
  },
  {
    error_code: "GATEWAY_ERROR",
    error_descriptions: [
      "Network error during payment processing",
      "Connection to payment gateway dropped",
      "Payment gateway returned an unexpected error",
    ],
    methods: ["netbanking", "card", "upi", "wallet"],
    recoverable: true,
    weight: 15,
  },
  {
    error_code: "BAD_REQUEST_ERROR",
    error_descriptions: [
      "Your payment could not be completed due to RBI auto-debit guidelines",
      "Payment declined by issuer due to risk policy",
    ],
    methods: ["card", "emandate"],
    recoverable: false,
    weight: 5,
  },
  {
    error_code: "SERVER_ERROR",
    error_descriptions: [
      "Payment could not be processed at this time. Please try again.",
      "Internal server error at payment processor",
    ],
    methods: ["card", "upi", "netbanking"],
    recoverable: true,
    weight: 10,
  },
];

const BANKS = [
  "HDFC", "ICICI", "SBI", "Axis", "Kotak", "PNB", "BOB",
  "Yes Bank", "IndusInd", "Federal", "IDBI", "Canara",
];

const FIRST_NAMES = [
  "Rahul", "Priya", "Amit", "Sneha", "Vikram", "Ananya", "Rohan",
  "Neha", "Karthik", "Divya", "Arjun", "Meera", "Suresh", "Pooja",
  "Rajesh", "Kavitha", "Deepak", "Swathi", "Manoj", "Lakshmi",
];

const LAST_NAMES = [
  "Sharma", "Patel", "Kumar", "Reddy", "Singh", "Nair", "Gupta",
  "Joshi", "Verma", "Iyer", "Das", "Mehta", "Shah", "Rao", "Pillai",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) / 100) * 100;
}

function weightedPick(profiles: FailureProfile[]): FailureProfile {
  const totalWeight = profiles.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * totalWeight;
  for (const p of profiles) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return profiles[profiles.length - 1];
}

function generateEvent(): PaymentFailureEvent {
  const profile = weightedPick(FAILURE_PROFILES);
  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);

  return {
    payment_id: `pay_sim_${nanoid(8)}`,
    order_id: `order_sim_${nanoid(8)}`,
    amount: randomAmount(50000, 10000000),
    currency: "INR",
    method: pick(profile.methods),
    error_code: profile.error_code,
    error_description: pick(profile.error_descriptions),
    customer: {
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
      name: `${firstName} ${lastName}`,
    },
    timestamp: new Date().toISOString(),
  };
}

const DEMO_SCENARIOS = [
  {
    label: "Bank Server Timeout",
    description: "HDFC bank server stopped responding during a UPI payment",
    expected_path: "Diagnose → Delayed Retry → Recovered",
    event: {
      amount: 250000, currency: "INR", method: "upi",
      error_code: "GATEWAY_ERROR",
      error_description: "Payment was unsuccessful as the bank server is not responding",
      customer: { email: "rahul.sharma@example.com", phone: "9876543210", name: "Rahul Sharma" },
    },
  },
  {
    label: "Insufficient Funds",
    description: "Card payment declined — customer's account has no balance",
    expected_path: "Diagnose → Not Recoverable → Stopped",
    event: {
      amount: 750000, currency: "INR", method: "card",
      error_code: "BAD_REQUEST_ERROR",
      error_description: "Insufficient account balance",
      customer: { email: "priya.patel@example.com", phone: "9123456789", name: "Priya Patel" },
    },
  },
  {
    label: "UPI Collect Expired",
    description: "Customer didn't approve the UPI collect request in time",
    expected_path: "Diagnose → Payment Link → Recovered",
    event: {
      amount: 149900, currency: "INR", method: "upi",
      error_code: "GATEWAY_ERROR",
      error_description: "Your payment could not be completed as the UPI transaction expired",
      customer: { email: "amit.kumar@example.com", phone: "9988776655", name: "Amit Kumar" },
    },
  },
  {
    label: "Expired Credit Card",
    description: "Customer tried to pay with an expired credit card",
    expected_path: "Diagnose → Payment Link (new card) → Recovered",
    event: {
      amount: 499900, currency: "INR", method: "card",
      error_code: "BAD_REQUEST_ERROR",
      error_description: "The card has expired",
      customer: { email: "sneha.reddy@example.com", phone: "9876501234", name: "Sneha Reddy" },
    },
  },
  {
    label: "Network Error",
    description: "Connection to payment gateway dropped mid-transaction",
    expected_path: "Diagnose → Immediate Retry → Recovered",
    event: {
      amount: 89900, currency: "INR", method: "netbanking",
      error_code: "GATEWAY_ERROR",
      error_description: "Network error during payment processing",
      customer: { email: "vikram.singh@example.com", phone: "9765432100", name: "Vikram Singh" },
    },
  },
];

export async function POST(req: NextRequest) {
  await connectDB();

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine — defaults to demo mode */ }

  const mode = body.mode || "demo";
  const count = Math.min(Math.max(body.count || 5, 1), 200);

  let events: PaymentFailureEvent[];
  let scenariosMeta: any[] | undefined;

  if (mode === "random") {
    events = Array.from({ length: count }, () => generateEvent());
  } else {
    events = DEMO_SCENARIOS.map((s) => ({
      ...s.event,
      payment_id: `pay_demo_${nanoid(8)}`,
      order_id: `order_demo_${nanoid(8)}`,
      timestamp: new Date().toISOString(),
    }));
    scenariosMeta = DEMO_SCENARIOS.map((s, i) => ({
      label: s.label,
      description: s.description,
      expected_path: s.expected_path,
      payment_id: events[i].payment_id,
      amount: events[i].amount,
      method: events[i].method,
    }));
  }

  const batchId = `batch_${nanoid(12)}`;

  const distribution: Record<string, number> = {};
  for (const e of events) {
    const key = e.error_code;
    distribution[key] = (distribution[key] || 0) + 1;
  }

  await Batch.create({
    batch_id: batchId,
    total_events: events.length,
    distribution,
    status: "processing",
    results: { recovered: 0, stopped: 0, failed: 0, pending: events.length },
    total_amount_processed: events.reduce((sum, e) => sum + e.amount, 0),
    started_at: new Date(),
  });

  const jobPayloads = events.map((event) => ({ event, batchId }));
  const enqueued = await enqueueBatchEvents(jobPayloads, 1000);

  if (!enqueued) {
    processDirectFallback(events, batchId);
  }

  const response: any = {
    batch_id: batchId,
    total_events: events.length,
    mode,
    status: "processing",
    queue_mode: enqueued ? "bullmq" : "direct_fallback",
  };

  if (scenariosMeta) {
    response.scenarios = scenariosMeta;
  }

  return NextResponse.json(response);
}

async function processDirectFallback(events: PaymentFailureEvent[], batchId: string) {
  let recovered = 0;
  let stopped = 0;
  let failed = 0;
  let totalRecoveredAmount = 0;

  for (const event of events) {
    try {
      const result = await processRecoveryEvent(event, batchId);
      if (result.outcome.result === "recovered") {
        recovered++;
        totalRecoveredAmount += result.outcome.recovered_amount || 0;
      } else if (result.outcome.result === "stopped") {
        stopped++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  await connectDB();
  const total = recovered + stopped + failed;
  const batch = await Batch.findOne({ batch_id: batchId });
  const startTime = batch?.started_at?.getTime() || Date.now();

  await Batch.findOneAndUpdate(
    { batch_id: batchId },
    {
      status: "completed",
      results: { recovered, stopped, failed, pending: 0 },
      recovery_rate: total > 0 ? recovered / total : 0,
      total_amount_recovered: totalRecoveredAmount,
      completed_at: new Date(),
      processing_time_ms: Date.now() - startTime,
    }
  );
}
