"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface BatchRow {
  batch_id: string;
  total_events: number;
  status: string;
  results: {
    recovered: number;
    stopped: number;
    failed: number;
    pending: number;
  };
  recovery_rate: number;
  total_amount_processed: number;
  total_amount_recovered: number;
  started_at: string;
  completed_at: string | null;
  processing_time_ms: number | null;
}

function formatAmount(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function formatPercent(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/batches");
        if (res.ok) {
          const data = await res.json();
          setBatches(data.batches);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950 text-zinc-400">
        Loading batches...
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950">
        <div className="text-center">
          <p className="text-zinc-400 text-lg">No batches yet</p>
          <p className="text-zinc-500 text-sm mt-2">
            Run a simulation from the Home page to create a batch
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-8 py-5">
        <h1 className="text-xl font-semibold">Batches</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          All batch runs with status and recovery rates
        </p>
      </header>

      <div className="px-8 py-6">
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="text-left px-4 py-3 font-medium text-zinc-400">
                  Batch ID
                </th>
                <th className="text-left px-4 py-3 font-medium text-zinc-400">
                  Status
                </th>
                <th className="text-right px-4 py-3 font-medium text-zinc-400">
                  Events
                </th>
                <th className="text-right px-4 py-3 font-medium text-zinc-400">
                  Recovery Rate
                </th>
                <th className="text-right px-4 py-3 font-medium text-zinc-400">
                  Recovered / Stopped / Failed
                </th>
                <th className="text-right px-4 py-3 font-medium text-zinc-400">
                  Amount Processed
                </th>
                <th className="text-right px-4 py-3 font-medium text-zinc-400">
                  Started
                </th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const statusColor =
                  batch.status === "completed"
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : batch.status === "processing"
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      : "bg-red-500/20 text-red-400 border-red-500/30";

                return (
                  <tr
                    key={batch.batch_id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/batches/${batch.batch_id}`}
                        className="font-mono text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        {batch.batch_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusColor}`}
                      >
                        {batch.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {batch.total_events}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-400">
                      {batch.status === "completed"
                        ? formatPercent(batch.recovery_rate)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400">
                      <span className="text-emerald-400">
                        {batch.results.recovered}
                      </span>
                      {" / "}
                      <span className="text-amber-400">
                        {batch.results.stopped}
                      </span>
                      {" / "}
                      <span className="text-red-400">
                        {batch.results.failed}
                      </span>
                      {batch.results.pending > 0 && (
                        <span className="text-zinc-500">
                          {" "}
                          ({batch.results.pending} pending)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {formatAmount(batch.total_amount_processed)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500">
                      {formatTime(batch.started_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
