"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface BatchDetail {
  batch_id: string;
  status: string;
  total: number;
  results: {
    recovered: number;
    stopped: number;
    failed: number;
    pending: number;
  };
  recovery_rate: number;
  breakdown: {
    by_type: Record<string, { total: number; recovered: number }>;
    by_intervention: Record<string, number>;
  };
  started_at: string;
  completed_at: string | null;
}

interface RecoveryRow {
  case_id: string;
  status: string;
  original_event: {
    amount: number;
    method: string;
    error_code: string;
    occurred_at: string;
  };
  diagnosis: {
    root_cause: string;
    confidence: number;
    fallback_used: boolean;
  } | null;
  outcome: {
    result: string;
    recovered_amount?: number;
    total_attempts: number;
    time_to_recovery_ms?: number;
  };
}

const COLORS = {
  recovered: "#10b981",
  stopped: "#f59e0b",
  failed: "#ef4444",
  pending: "#6366f1",
};

function formatAmount(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function formatPercent(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatDuration(ms: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BatchDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [cases, setCases] = useState<RecoveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [batchRes, casesRes] = await Promise.all([
          fetch(`/api/batch/${id}`),
          fetch(`/api/recoveries?batch_id=${id}&limit=100`),
        ]);

        if (!batchRes.ok) {
          setError(batchRes.status === 404 ? "Batch not found" : "Failed to load");
          return;
        }

        setBatch(await batchRes.json());
        if (casesRes.ok) {
          const casesData = await casesRes.json();
          setCases(casesData.cases);
        }
      } catch {
        setError("Failed to load batch");
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950 text-zinc-400">
        Loading batch...
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950">
        <div className="text-center">
          <p className="text-red-400 text-lg">{error || "Not found"}</p>
          <Link href="/batches" className="text-blue-400 text-sm mt-2 hover:underline">
            Back to batches
          </Link>
        </div>
      </div>
    );
  }

  const statusColor =
    batch.status === "completed"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      : batch.status === "processing"
        ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
        : "bg-red-500/20 text-red-400 border-red-500/30";

  const donutData = [
    { name: "Recovered", value: batch.results.recovered, color: COLORS.recovered },
    { name: "Stopped", value: batch.results.stopped, color: COLORS.stopped },
    { name: "Failed", value: batch.results.failed, color: COLORS.failed },
    ...(batch.results.pending > 0
      ? [{ name: "Pending", value: batch.results.pending, color: COLORS.pending }]
      : []),
  ].filter((d) => d.value > 0);

  const typeBarData = Object.entries(batch.breakdown.by_type)
    .map(([type, data]) => ({
      type: type.replace(/_/g, " "),
      total: data.total,
      recovered: data.recovered,
    }))
    .sort((a, b) => b.total - a.total);

  const totalRecoveredAmount = cases
    .filter((c) => c.outcome.result === "recovered")
    .reduce((sum, c) => sum + (c.outcome.recovered_amount || 0), 0);

  const totalProcessedAmount = cases.reduce((sum, c) => sum + c.original_event.amount, 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-8 py-5">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/batches" className="text-zinc-500 hover:text-zinc-300 text-sm">
            ← Batches
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold font-mono">{batch.batch_id}</h1>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${statusColor}`}>
            {batch.status}
          </span>
        </div>
        <p className="text-sm text-zinc-400 mt-0.5">
          Started {formatTime(batch.started_at)}
          {batch.completed_at && ` · Completed ${formatTime(batch.completed_at)}`}
        </p>
      </header>

      <div className="px-8 py-6 space-y-6">
        {/* Summary stat cards */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Total Events" value={`${batch.total}`} accent="text-zinc-100" />
          <StatCard label="Recovery Rate" value={formatPercent(batch.recovery_rate)} accent="text-emerald-400" />
          <StatCard
            label="Recovered"
            value={`${batch.results.recovered}`}
            sub={`of ${batch.results.recovered + batch.results.stopped + batch.results.failed}`}
            accent="text-emerald-400"
          />
          <StatCard label="Stopped" value={`${batch.results.stopped}`} accent="text-amber-400" />
          <StatCard
            label="Amount Recovered"
            value={formatAmount(totalRecoveredAmount)}
            sub={`of ${formatAmount(totalProcessedAmount)}`}
            accent="text-emerald-400"
          />
        </section>

        {/* Charts */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-4">Outcome Distribution</h2>
            {donutData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      border: "1px solid #3f3f46",
                      borderRadius: "8px",
                      color: "#e4e4e7",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-10">Processing...</p>
            )}
            <div className="flex justify-center gap-4 text-xs mt-2">
              {donutData.map((d) => (
                <span key={d.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-zinc-400">{d.name} ({d.value})</span>
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-4">Recovery by Failure Type</h2>
            {typeBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={typeBarData} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="type"
                    width={130}
                    tick={{ fill: "#a1a1aa", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#18181b",
                      border: "1px solid #3f3f46",
                      borderRadius: "8px",
                      color: "#e4e4e7",
                    }}
                    formatter={(value, name) => {
                      if (name === "recovered") return [String(value), "Recovered"];
                      return [String(value), "Total"];
                    }}
                  />
                  <Bar dataKey="total" fill="#3f3f46" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="recovered" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-10">Processing...</p>
            )}
          </div>
        </section>

        {/* Intervention breakdown */}
        {Object.keys(batch.breakdown.by_intervention).length > 0 && (
          <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-3">Interventions Used</h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(batch.breakdown.by_intervention)
                .sort(([, a], [, b]) => b - a)
                .map(([action, count]) => (
                  <div key={action} className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2">
                    <p className="text-xs text-zinc-400">{action.replace(/_/g, " ")}</p>
                    <p className="text-lg font-semibold text-zinc-200">{count}</p>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Recovery cases table */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm font-medium text-zinc-300 mb-3">
            Recovery Cases ({cases.length})
          </h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-3 py-2 font-medium text-zinc-400">Case ID</th>
                  <th className="text-left px-3 py-2 font-medium text-zinc-400">Status</th>
                  <th className="text-right px-3 py-2 font-medium text-zinc-400">Amount</th>
                  <th className="text-left px-3 py-2 font-medium text-zinc-400">Method</th>
                  <th className="text-left px-3 py-2 font-medium text-zinc-400">Root Cause</th>
                  <th className="text-left px-3 py-2 font-medium text-zinc-400">Outcome</th>
                  <th className="text-right px-3 py-2 font-medium text-zinc-400">Attempts</th>
                  <th className="text-right px-3 py-2 font-medium text-zinc-400">Time</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => {
                  const rowStatusColor =
                    c.outcome.result === "recovered"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : c.outcome.result === "stopped"
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        : c.outcome.result === "failed"
                          ? "bg-red-500/20 text-red-400 border-red-500/30"
                          : "bg-blue-500/20 text-blue-400 border-blue-500/30";

                  return (
                    <tr key={c.case_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                      <td className="px-3 py-2">
                        <Link
                          href={`/recoveries/${c.case_id}`}
                          className="font-mono text-xs text-blue-400 hover:text-blue-300"
                        >
                          {c.case_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${rowStatusColor}`}>
                          {c.outcome.result}
                        </span>
                        {c.diagnosis?.fallback_used && (
                          <span className="ml-1 text-[9px] font-semibold uppercase px-1 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                            FB
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-300">
                        {formatAmount(c.original_event.amount)}
                      </td>
                      <td className="px-3 py-2 uppercase text-zinc-400 text-xs">
                        {c.original_event.method}
                      </td>
                      <td className="px-3 py-2 text-zinc-300 text-xs">
                        {c.diagnosis?.root_cause?.replace(/_/g, " ") || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={c.outcome.result === "recovered" ? "text-emerald-400" : c.outcome.result === "stopped" ? "text-amber-400" : c.outcome.result === "failed" ? "text-red-400" : "text-blue-400"}>
                          {c.outcome.result}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-400">
                        {c.outcome.total_attempts}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-400">
                        {formatDuration(c.outcome.time_to_recovery_ms || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}
