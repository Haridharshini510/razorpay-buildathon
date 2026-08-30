import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { RecoveryCase } from "@/models/RecoveryCase";
import { AuditLog } from "@/models/AuditLog";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();

  const { id } = await params;
  const recoveryCase = await RecoveryCase.findOne({ case_id: id }).lean();

  if (!recoveryCase) {
    return NextResponse.json(
      { error: { code: "CASE_NOT_FOUND", message: `Recovery case ${id} does not exist` } },
      { status: 404 }
    );
  }

  const auditEntries = await AuditLog.find({ recovery_case_id: id })
    .sort({ timestamp: 1 })
    .lean();

  return NextResponse.json({
    ...recoveryCase,
    audit_trail: auditEntries,
  });
}
