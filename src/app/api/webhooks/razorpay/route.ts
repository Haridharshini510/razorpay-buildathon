import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db";
import { getRecoveryQueue } from "@/lib/redis";
import { processRecoveryEvent } from "@/services/orchestrator";

export async function POST(req: NextRequest) {
  await connectDB();

  const body = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (webhookSecret && signature) {
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      return NextResponse.json(
        { error: { code: "INVALID_SIGNATURE", message: "Webhook signature verification failed" } },
        { status: 401 }
      );
    }
  }

  const event = JSON.parse(body);

  if (event.event === "payment.failed") {
    const payment = event.payload.payment.entity;

    const failureEvent = {
      payment_id: payment.id,
      order_id: payment.order_id,
      amount: payment.amount,
      currency: payment.currency || "INR",
      method: payment.method,
      error_code: payment.error_code,
      error_description: payment.error_description || "Payment failed",
      customer: {
        email: payment.email || "",
        phone: payment.contact || "",
      },
      timestamp: new Date().toISOString(),
    };

    const queue = getRecoveryQueue();
    if (queue) {
      await queue.add("recover", { event: failureEvent, batchId: null });
    } else {
      await processRecoveryEvent(failureEvent);
    }
  }

  return NextResponse.json({ status: "ok" });
}
