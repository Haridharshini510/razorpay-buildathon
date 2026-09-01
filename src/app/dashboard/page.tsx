"use client";

import { useState, useEffect } from "react";
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
  Legend,
} from "recharts";

interface Metrics {
  total_events_processed: number;
  total_recovered: number;
  total_stopped: number;
  total_failed: number;
  total_pending: number;
  recovery_rate: number;
  total_amount_recovered: number;
  avg_time_to_recovery_ms: number;
  by_failure_type: Record<
    string,
    { count: number; recovered: number; recovery_rate: number }
  >;
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

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatPercent(rate: number) {
  return `${(rate * 100).toFixed(1)}%`;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/metrics");
        if (res.ok) setMetrics(await res.json());
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
        Loading metrics...
      </div>
    );
  }

  if (!metrics || metrics.total_events_processed === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950">
        <div className="text-center">
          <p className="text-zinc-400 text-lg">No data yet</p>
          <p className="text-zinc-500 text-sm mt-2">
            Run a simulation from the Home page to see metrics here
          </p>
        </div>
      </div>
    );
  }

  const donutData = [
    { name: "Recovered", value: metrics.total_recovered, color: COLORS.recovered },
    { name: "Stopped", value: metrics.total_stopped, color: COLORS.stopped },
    { name: "Failed", value: metrics.total_failed, color: COLORS.failed },
    ...(metrics.total_pending > 0
      ? [{ name: "Pending", value: metrics.total_pending, color: COLORS.pending }]
      : []),
  ].filter((d) => d.value > 0);

  const barData = Object.entries(metrics.by_failure_type)
    .map(([type, data]) => ({
      type: type.replace(/_/g, " "),
      total: data.count,
      recovered: data.recovered,
      rate: data.recovery_rate,
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-8 py-5">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Aggregate recovery metrics across all batches
        </p>
      </header>

      <div className="px-8 py-6 space-y-8">
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard
            label="Recovery Rate"
            value={formatPercent(metrics.recovery_rate)}
            accent="text-emerald-400"
          />
          <StatCard
            label="Total Processed"
            value={`${metrics.total_events_processed}`}
            sub={`${metrics.total_pending} pending`}
            accent="text-zinc-100"
          />
          <StatCard
            label="Recovered"
            value={`${metrics.total_recovered}`}
            accent="text-emerald-400"
          />
          <StatCard
            label="Amount Recovered"
            value={formatAmount(metrics.total_amount_recovered)}
            accent="text-emerald-400"
          />
          <StatCard
            label="Avg Recovery Time"
            value={formatDuration(metrics.avg_time_to_recovery_ms)}
            accent="text-blue-400"
          />
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-4">
              Outcome Distribution
            </h2>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
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
                <Legend
                  formatter={(value) => (
                    <span className="text-xs text-zinc-300">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-4">
              Recovery Rate by Failure Type
            </h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} layout="vertical">
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
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}
