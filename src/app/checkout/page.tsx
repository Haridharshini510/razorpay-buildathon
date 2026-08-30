"use client";

import { useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function CheckoutPage() {
  const [amount, setAmount] = useState(500);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePayment() {
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amount * 100 }),
      });
      const order = await res.json();

      if (order.error) {
        setStatus(`Error: ${order.error}`);
        setLoading(false);
        return;
      }

      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "Recovery Agent Demo",
        description: "Test payment to trigger failure recovery",
        order_id: order.order_id,
        handler: function (response: any) {
          setStatus(`Payment succeeded: ${response.razorpay_payment_id} — no recovery needed`);
        },
        modal: {
          ondismiss: function () {
            setStatus("Payment dismissed by user");
          },
        },
        prefill: {
          name: "Test Customer",
          email: "test@example.com",
          contact: "9876543210",
        },
        theme: {
          color: "#3b82f6",
        },
      };

      const rzp = new window.Razorpay(options);

      rzp.on("payment.failed", function (response: any) {
        setStatus(
          `Payment failed — recovery agent will process this automatically.\n` +
          `Error: ${response.error.description}\n` +
          `Payment ID: ${response.error.metadata?.payment_id || "N/A"}`
        );
      });

      rzp.open();
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />

      <div className="w-full max-w-md mx-auto p-8">
        <h1 className="text-2xl font-semibold mb-2">Test Checkout</h1>
        <p className="text-sm text-zinc-400 mb-8">
          Trigger a real payment failure to test the recovery agent
        </p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Amount (INR)</label>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              suppressHydrationWarning
            />
          </div>

          <button
            onClick={handlePayment}
            disabled={loading}
            className="w-full rounded bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
            suppressHydrationWarning
          >
            {loading ? "Creating order..." : `Pay ₹${amount}`}
          </button>

          <div className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm space-y-3">
            <p className="font-medium text-zinc-300">Test cards to trigger failures:</p>
            <div className="space-y-2 text-zinc-400">
              <div>
                <code className="text-red-400">4000 0000 0000 0002</code>
                <span className="ml-2">— Card declined</span>
              </div>
              <div>
                <code className="text-red-400">5104 0600 0000 0008</code>
                <span className="ml-2">— Insufficient funds</span>
              </div>
              <div>
                <span className="text-zinc-500">Use any future expiry, any CVV, any OTP</span>
              </div>
            </div>
          </div>

          {status && (
            <div className={`rounded p-4 text-sm whitespace-pre-wrap ${
              status.includes("succeeded")
                ? "bg-emerald-950 border border-emerald-800 text-emerald-300"
                : status.includes("failed")
                ? "bg-red-950 border border-red-800 text-red-300"
                : "bg-zinc-900 border border-zinc-700 text-zinc-300"
            }`}>
              {status}
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
