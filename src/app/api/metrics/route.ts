import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { RecoveryCase } from "@/models/RecoveryCase";

export async function GET() {
  await connectDB();

  const cases = await RecoveryCase.find().lean();

  const total = cases.length;
  const recovered = cases.filter((c) => c.outcome.result === "recovered").length;
  const stopped = cases.filter((c) => c.outcome.result === "stopped").length;
  const failed = cases.filter((c) => c.outcome.result === "failed").length;
  const pending = cases.filter((c) => c.outcome.result === "pending").length;

  const completedCases = total - pending;
  const recoveryRate = completedCases > 0 ? recovered / completedCases : 0;

  const totalAmountRecovered = cases
    .filter((c) => c.outcome.result === "recovered")
    .reduce((sum, c) => sum + (c.outcome.recovered_amount || 0), 0);

  const recoveryTimes = cases
    .filter((c) => c.outcome.time_to_recovery_ms)
    .map((c) => c.outcome.time_to_recovery_ms!);
  const avgTimeToRecovery = recoveryTimes.length > 0
    ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
    : 0;

  // By failure type
  const byFailureType: Record<string, { count: number; recovered: number; recovery_rate: number }> = {};
  for (const c of cases) {
    const rootCause = c.diagnosis?.root_cause || "unknown";
    if (!byFailureType[rootCause]) {
      byFailureType[rootCause] = { count: 0, recovered: 0, recovery_rate: 0 };
    }
    byFailureType[rootCause].count++;
    if (c.outcome.result === "recovered") byFailureType[rootCause].recovered++;
  }
  for (const key of Object.keys(byFailureType)) {
    const entry = byFailureType[key];
    entry.recovery_rate = entry.count > 0 ? entry.recovered / entry.count : 0;
  }

  return NextResponse.json({
    total_events_processed: total,
    total_recovered: recovered,
    total_stopped: stopped,
    total_failed: failed,
    total_pending: pending,
    recovery_rate: recoveryRate,
    total_amount_recovered: totalAmountRecovered,
    avg_time_to_recovery_ms: avgTimeToRecovery,
    by_failure_type: byFailureType,
  });
}
