"use client";

import { useState, useEffect, useCallback } from "react";

interface Metrics {
  total_events_processed: number;
  total_recovered: number;
  total_stopped: number;
  total_failed: number;
  total_pending: number;
  recovery_rate: number;
  total_amount_recovered: number;
  avg_time_to_recovery_ms: number;
  by_failure_type: Record<string, { count: number; recovered: number; recovery_rate: number }>;
}

interface BatchResult {
  batch_id: string;
  total_events: number;
  status: string;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [simCount, setSimCount] = useState(20);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/metrics");
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  async function runSimulation() {
    setSimulating(true);
    setBatchResult(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: simCount }),
      });
      if (res.ok) {
        const data = await res.json();
        setBatchResult(data);
      }
    } catch {
      // ignore
    } finally {
      setSimulating(false);
    }
  }

  function formatAmount(paise: number) {
    return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  }

  function formatPercent(rate: number) {
    return `${(rate * 100).toFixed(1)}%`;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Payment Recovery Agent</h1>
            <p className="text-sm text-zinc-400">AI-powered payment failure recovery</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/checkout"
              className="rounded border border-zinc-700 px-4 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Test Checkout
            </a>
            <input
              type="number"
              min={1}
              max={200}
              value={simCount}
              onChange={(e) => setSimCount(Number(e.target.value))}
              className="w-20 rounded bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              suppressHydrationWarning
            />
            <button
              onClick={runSimulation}
              disabled={simulating}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              suppressHydrationWarning
            >
              {simulating ? "Simulating..." : "Run Simulation"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {batchResult && (
          <div className="rounded-lg bg-blue-950/50 border border-blue-800 px-4 py-3 text-sm">
            Batch <code className="font-mono text-blue-300">{batchResult.batch_id}</code> started
            — processing {batchResult.total_events} events. Metrics will update automatically.
          </div>
        )}

        {loading ? (
          <div className="text-center text-zinc-500 py-20">Loading metrics...</div>
        ) : !metrics || metrics.total_events_processed === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-400 text-lg">No data yet</p>
            <p className="text-zinc-500 text-sm mt-2">Run a simulation to see recovery metrics</p>
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Recovery Rate"
                value={formatPercent(metrics.recovery_rate)}
                accent="text-emerald-400"
              />
              <StatCard
                label="Amount Recovered"
                value={formatAmount(metrics.total_amount_recovered)}
                accent="text-emerald-400"
              />
              <StatCard
                label="Total Processed"
                value={metrics.total_events_processed.toString()}
                accent="text-zinc-100"
              />
              <StatCard
                label="Avg Recovery Time"
                value={metrics.avg_time_to_recovery_ms > 0 ? `${(metrics.avg_time_to_recovery_ms / 1000).toFixed(1)}s` : "—"}
                accent="text-zinc-100"
              />
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MiniCard label="Recovered" value={metrics.total_recovered} color="bg-emerald-500" />
              <MiniCard label="Stopped" value={metrics.total_stopped} color="bg-amber-500" />
              <MiniCard label="Failed" value={metrics.total_failed} color="bg-red-500" />
            </section>

            <section>
              <h2 className="text-lg font-medium mb-4">Recovery by Failure Type</h2>
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-900">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-zinc-400">Root Cause</th>
                      <th className="text-right px-4 py-3 font-medium text-zinc-400">Count</th>
                      <th className="text-right px-4 py-3 font-medium text-zinc-400">Recovered</th>
                      <th className="text-right px-4 py-3 font-medium text-zinc-400">Rate</th>
                      <th className="px-4 py-3 font-medium text-zinc-400">Recovery Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {Object.entries(metrics.by_failure_type)
                      .sort((a, b) => b[1].count - a[1].count)
                      .map(([cause, data]) => (
                        <tr key={cause} className="hover:bg-zinc-900/50">
                          <td className="px-4 py-3 font-mono text-xs">{cause}</td>
                          <td className="px-4 py-3 text-right">{data.count}</td>
                          <td className="px-4 py-3 text-right text-emerald-400">{data.recovered}</td>
                          <td className="px-4 py-3 text-right">{formatPercent(data.recovery_rate)}</td>
                          <td className="px-4 py-3">
                            <div className="w-full bg-zinc-800 rounded-full h-2">
                              <div
                                className="bg-emerald-500 h-2 rounded-full transition-all"
                                style={{ width: `${data.recovery_rate * 100}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-5">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

function MiniCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4 flex items-center gap-3">
      <div className={`h-3 w-3 rounded-full ${color}`} />
      <div>
        <p className="text-xs text-zinc-400">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </div>
    </div>
  );
}
