import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { connectDB } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { processRecoveryEvent, PaymentFailureEvent } from "@/services/orchestrator";

export async function POST(req: NextRequest) {
  await connectDB();

  const { events } = await req.json();

  if (!events || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "events array is required" } },
      { status: 400 }
    );
  }

  const batchId = `batch_${nanoid(12)}`;

  // Create batch record
  const batch = await Batch.create({
    batch_id: batchId,
    total_events: events.length,
    distribution: computeDistribution(events),
    status: "processing",
    results: { recovered: 0, stopped: 0, failed: 0, pending: events.length },
    total_amount_processed: events.reduce((sum: number, e: any) => sum + (e.amount || 0), 0),
    started_at: new Date(),
  });

  const startTime = Date.now();
  processEventsInBackground(events, batchId, startTime);

  return NextResponse.json({
    batch_id: batchId,
    total_events: events.length,
    status: "processing",
    created_at: batch.started_at,
  });
}

async function processEventsInBackground(events: PaymentFailureEvent[], batchId: string, startTime: number) {
  let recovered = 0;
  let stopped = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const result = await processRecoveryEvent(event, batchId);
      if (result.outcome.result === "recovered") recovered++;
      else if (result.outcome.result === "stopped") stopped++;
      else failed++;
    } catch {
      failed++;
    }

    // Small delay to avoid overwhelming the LLM
    await new Promise((r) => setTimeout(r, 100));
  }

  // Update batch with final results
  await connectDB();
  const total = recovered + stopped + failed;
  await Batch.findOneAndUpdate(
    { batch_id: batchId },
    {
      status: "completed",
      results: { recovered, stopped, failed, pending: 0 },
      recovery_rate: total > 0 ? recovered / total : 0,
      total_amount_recovered: 0, // Would calculate from cases
      completed_at: new Date(),
      processing_time_ms: Date.now() - startTime,
    }
  );
}

function computeDistribution(events: any[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const e of events) {
    const key = e.error_code || "unknown";
    dist[key] = (dist[key] || 0) + 1;
  }
  return dist;
}
