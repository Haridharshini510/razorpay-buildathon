import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { AuditLog } from "@/models/AuditLog";

export async function GET(req: NextRequest) {
  await connectDB();

  const searchParams = req.nextUrl.searchParams;
  const recoveryId = searchParams.get("recovery_id");
  const stage = searchParams.get("stage");
  const aiUsed = searchParams.get("ai_used");
  const batchId = searchParams.get("batch_id");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const filter: Record<string, any> = {};
  if (recoveryId) filter.recovery_case_id = recoveryId;
  if (stage) filter.stage = stage;
  if (aiUsed !== null && aiUsed !== undefined) filter.ai_used = aiUsed === "true";
  if (batchId) filter.batch_id = batchId;

  const total = await AuditLog.countDocuments(filter);
  const entries = await AuditLog.find(filter)
    .sort({ timestamp: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return NextResponse.json({
    entries,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
