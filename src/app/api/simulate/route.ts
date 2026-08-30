import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { connectDB } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { processRecoveryEvent, PaymentFailureEvent } from "@/services/orchestrator";

const ERROR_TEMPLATES: Record<string, { error_code: string; error_description: string }[]> = {
  bank_timeout: [
    { error_code: "GATEWAY_ERROR", error_description: "Payment was unsuccessful as the bank server is not responding" },
    { error_code: "GATEWAY_ERROR", error_description: "Bank server timeout during payment processing" },
  ],
  insufficient_funds: [
    { error_code: "BAD_REQUEST_ERROR", error_description: "Insufficient account balance" },
    { error_code: "BAD_REQUEST_ERROR", error_description: "Your account does not have enough balance to complete this transaction" },
  ],
  card_expired: [
    { error_code: "BAD_REQUEST_ERROR", error_description: "The card has expired" },
    { error_code: "BAD_REQUEST_ERROR", error_description: "Card expired. Please use a different card." },
  ],
  upi_expired: [
    { error_code: "GATEWAY_ERROR", error_description: "Your payment could not be completed as the UPI transaction expired" },
    { error_code: "GATEWAY_ERROR", error_description: "UPI collect request expired" },
  ],
  network_error: [
    { error_code: "GATEWAY_ERROR", error_description: "Network error during payment processing" },
    { error_code: "GATEWAY_ERROR", error_description: "Connection to bank network failed" },
  ],
};

const METHODS = ["upi", "card", "netbanking", "wallet"];
const BANKS = ["HDFC", "SBI", "ICICI", "Axis", "Kotak", "PNB"];

function generateEvent(type: string, amountRange: { min: number; max: number }): PaymentFailureEvent {
  const templates = ERROR_TEMPLATES[type] || ERROR_TEMPLATES.bank_timeout;
  const template = templates[Math.floor(Math.random() * templates.length)];
  const amount = Math.floor(Math.random() * (amountRange.max - amountRange.min) + amountRange.min);
  const method = type === "upi_expired" ? "upi" : type === "card_expired" ? "card" : METHODS[Math.floor(Math.random() * METHODS.length)];

  return {
    payment_id: `pay_sim_${nanoid(8)}`,
    order_id: `order_sim_${nanoid(8)}`,
    amount,
    currency: "INR",
    method,
    error_code: template.error_code,
    error_description: template.error_description,
    customer: {
      email: `customer_${nanoid(4)}@example.com`,
      phone: `98${Math.floor(Math.random() * 100000000).toString().padStart(8, "0")}`,
      name: `Test Customer ${nanoid(4)}`,
    },
    timestamp: new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  await connectDB();

  const body = await req.json();
  const count = body.count || 50;
  const distribution = body.distribution || {
    bank_timeout: 0.30,
    insufficient_funds: 0.20,
    card_expired: 0.15,
    upi_expired: 0.15,
    network_error: 0.20,
  };
  const amountRange = body.amount_range || { min: 50000, max: 10000000 }; // ₹500 to ₹1L in paise

  // Generate events based on distribution
  const events: PaymentFailureEvent[] = [];
  for (const [type, ratio] of Object.entries(distribution)) {
    const typeCount = Math.round(count * (ratio as number));
    for (let i = 0; i < typeCount; i++) {
      events.push(generateEvent(type, amountRange));
    }
  }

  // Fill remaining if rounding caused a deficit
  while (events.length < count) {
    events.push(generateEvent("bank_timeout", amountRange));
  }

  // Shuffle
  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [events[i], events[j]] = [events[j], events[i]];
  }

  const batchId = `batch_${nanoid(12)}`;

  await Batch.create({
    batch_id: batchId,
    total_events: events.length,
    distribution: Object.fromEntries(
      Object.entries(distribution).map(([k, v]) => [k, Math.round(count * (v as number))])
    ),
    status: "processing",
    results: { recovered: 0, stopped: 0, failed: 0, pending: events.length },
    total_amount_processed: events.reduce((sum, e) => sum + e.amount, 0),
    started_at: new Date(),
  });

  // Process in background
  processSimulatedBatch(events, batchId);

  return NextResponse.json({
    batch_id: batchId,
    total_events: events.length,
    status: "processing",
    distribution,
  });
}

async function processSimulatedBatch(events: PaymentFailureEvent[], batchId: string) {
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
    await new Promise((r) => setTimeout(r, 50));
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
