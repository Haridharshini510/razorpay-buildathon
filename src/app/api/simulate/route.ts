import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { connectDB } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { processRecoveryEvent, PaymentFailureEvent } from "@/services/orchestrator";

interface DemoScenario {
  label: string;
  description: string;
  expected_path: string;
  event: Omit<PaymentFailureEvent, "payment_id" | "order_id" | "timestamp">;
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    label: "Bank Server Timeout",
    description: "HDFC bank server stopped responding during a UPI payment",
    expected_path: "Diagnose → Delayed Retry → Recovered",
    event: {
      amount: 250000,
      currency: "INR",
      method: "upi",
      error_code: "GATEWAY_ERROR",
      error_description:
        "Payment was unsuccessful as the bank server is not responding",
      customer: {
        email: "rahul.sharma@example.com",
        phone: "9876543210",
        name: "Rahul Sharma",
      },
    },
  },
  {
    label: "Insufficient Funds",
    description: "Card payment declined — customer's account has no balance",
    expected_path: "Diagnose → Not Recoverable → Stopped",
    event: {
      amount: 750000,
      currency: "INR",
      method: "card",
      error_code: "BAD_REQUEST_ERROR",
      error_description: "Insufficient account balance",
      customer: {
        email: "priya.patel@example.com",
        phone: "9123456789",
        name: "Priya Patel",
      },
    },
  },
  {
    label: "UPI Collect Expired",
    description: "Customer didn't approve the UPI collect request in time",
    expected_path: "Diagnose → Payment Link → Recovered",
    event: {
      amount: 149900,
      currency: "INR",
      method: "upi",
      error_code: "GATEWAY_ERROR",
      error_description:
        "Your payment could not be completed as the UPI transaction expired",
      customer: {
        email: "amit.kumar@example.com",
        phone: "9988776655",
        name: "Amit Kumar",
      },
    },
  },
  {
    label: "Expired Credit Card",
    description: "Customer tried to pay with an expired credit card",
    expected_path: "Diagnose → Payment Link (new card) → Recovered",
    event: {
      amount: 499900,
      currency: "INR",
      method: "card",
      error_code: "BAD_REQUEST_ERROR",
      error_description: "The card has expired",
      customer: {
        email: "sneha.reddy@example.com",
        phone: "9876501234",
        name: "Sneha Reddy",
      },
    },
  },
  {
    label: "Network Error",
    description: "Connection to payment gateway dropped mid-transaction",
    expected_path: "Diagnose → Immediate Retry → Recovered",
    event: {
      amount: 89900,
      currency: "INR",
      method: "netbanking",
      error_code: "GATEWAY_ERROR",
      error_description: "Network error during payment processing",
      customer: {
        email: "vikram.singh@example.com",
        phone: "9765432100",
        name: "Vikram Singh",
      },
    },
  },
];

export async function POST() {
  await connectDB();

  const batchId = `batch_${nanoid(12)}`;

  const events: PaymentFailureEvent[] = DEMO_SCENARIOS.map((scenario) => ({
    ...scenario.event,
    payment_id: `pay_demo_${nanoid(8)}`,
    order_id: `order_demo_${nanoid(8)}`,
    timestamp: new Date().toISOString(),
  }));

  await Batch.create({
    batch_id: batchId,
    total_events: events.length,
    distribution: {
      bank_timeout: 1,
      insufficient_funds: 1,
      upi_expired: 1,
      card_expired: 1,
      network_error: 1,
    },
    status: "processing",
    results: { recovered: 0, stopped: 0, failed: 0, pending: events.length },
    total_amount_processed: events.reduce((sum, e) => sum + e.amount, 0),
    started_at: new Date(),
  });

  processDemoBatch(events, batchId);

  return NextResponse.json({
    batch_id: batchId,
    total_events: events.length,
    status: "processing",
    scenarios: DEMO_SCENARIOS.map((s, i) => ({
      label: s.label,
      description: s.description,
      expected_path: s.expected_path,
      payment_id: events[i].payment_id,
      amount: events[i].amount,
      method: events[i].method,
    })),
  });
}

async function processDemoBatch(
  events: PaymentFailureEvent[],
  batchId: string
) {
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
  const startedBatch = await Batch.findOne({ batch_id: batchId });
  const startTime = startedBatch?.started_at?.getTime() || Date.now();

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
