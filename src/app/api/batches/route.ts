import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Batch } from "@/models/Batch";

export async function GET() {
  await connectDB();

  const batches = await Batch.find()
    .sort({ started_at: -1 })
    .limit(50)
    .lean();

  return NextResponse.json({ batches });
}
