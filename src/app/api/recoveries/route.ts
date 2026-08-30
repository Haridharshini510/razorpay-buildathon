import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { RecoveryCase } from "@/models/RecoveryCase";

export async function GET(req: NextRequest) {
  await connectDB();

  const searchParams = req.nextUrl.searchParams;
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const batchId = searchParams.get("batch_id");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const filter: Record<string, any> = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (batchId) filter.batch_id = batchId;

  const total = await RecoveryCase.countDocuments(filter);
  const cases = await RecoveryCase.find(filter)
    .sort({ created_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return NextResponse.json({
    cases,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}
