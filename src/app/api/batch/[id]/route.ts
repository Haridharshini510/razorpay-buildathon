import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { RecoveryCase } from "@/models/RecoveryCase";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();

  const { id } = await params;
  const batch = await Batch.findOne({ batch_id: id });

  if (!batch) {
    return NextResponse.json(
      { error: { code: "BATCH_NOT_FOUND", message: `Batch ${id} does not exist` } },
      { status: 404 }
    );
  }

  // Get live results from recovery cases
  const cases = await RecoveryCase.find({ batch_id: id });
  const results = {
    recovered: cases.filter((c) => c.outcome.result === "recovered").length,
    stopped: cases.filter((c) => c.outcome.result === "stopped").length,
    failed: cases.filter((c) => c.outcome.result === "failed").length,
    pending: cases.filter((c) => c.outcome.result === "pending").length,
  };

  const total = results.recovered + results.stopped + results.failed;

  // Breakdown by root cause
  const byType: Record<string, { total: number; recovered: number }> = {};
  for (const c of cases) {
    const rootCause = c.diagnosis?.root_cause || "unknown";
    if (!byType[rootCause]) byType[rootCause] = { total: 0, recovered: 0 };
    byType[rootCause].total++;
    if (c.outcome.result === "recovered") byType[rootCause].recovered++;
  }

  // Breakdown by intervention
  const byIntervention: Record<string, number> = {};
  for (const c of cases) {
    for (const intervention of c.interventions) {
      byIntervention[intervention.action] = (byIntervention[intervention.action] || 0) + 1;
    }
  }

  return NextResponse.json({
    batch_id: batch.batch_id,
    status: results.pending > 0 ? "processing" : "completed",
    total: batch.total_events,
    results,
    recovery_rate: total > 0 ? results.recovered / total : 0,
    breakdown: {
      by_type: byType,
      by_intervention: byIntervention,
    },
    started_at: batch.started_at,
    completed_at: batch.completed_at,
  });
}
