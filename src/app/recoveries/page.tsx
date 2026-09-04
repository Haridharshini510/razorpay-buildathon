"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface RecoveryRow {
  case_id: string;
  batch_id: string | null;
  status: string;
  original_event: {
    payment_id: string;
    amount: number;
    method: string;
    error_code: string;
    error_description: string;
    occurred_at: string;
  };
  diagnosis: {
    root_cause: string;
    confidence: number;
    recoverable: boolean;
    fallback_used: boolean;
  } | null;
  outcome: {
    result: string;
    recovered_amount?: number;
    time_to_recovery_ms?: number;
    total_attempts: number;
    final_method?: string;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const STATUS_OPTIONS = ["all", "resolved", "stopped", "failed", "pending", "diagnosing", "intervening"];
const ROOT_CAUSE_OPTIONS = [
  "all",
  "bank_server_timeout",
  "insufficient_funds",
  "card_expired",
  "upi_expired",
  "network_error",
  "rate_limit",
  "bank_maintenance",
  "fraud_suspected",
  "invalid_details",
  "bank_declined",
  "internal_error",
];

function formatAmount(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
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

export default function RecoveriesPage() {
  const [cases, setCases] = useState<RecoveryRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [rootCauseFilter, setRootCauseFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("");

  const fetchCases = useCallback(async (page: number) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (batchFilter.trim()) params.set("batch_id", batchFilter.trim());

      const res = await fetch(`/api/recoveries?${params}`);
      if (res.ok) {
        const data = await res.json();
        let filtered = data.cases;
        if (rootCauseFilter !== "all") {
          filtered = filtered.filter(
            (c: RecoveryRow) => c.diagnosis?.root_cause === rootCauseFilter
          );
        }
        setCases(filtered);
        setPagination(data.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, rootCauseFilter, batchFilter]);

  useEffect(() => {
    setLoading(true);
    fetchCases(1);
    const interval = setInterval(() => fetchCases(pagination.page), 5000);
    return () => clearInterval(interval);
  }, [fetchCases, pagination.page]);

  const statusColor = (status: string) => {
    switch (status) {
      case "resolved": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "stopped": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "failed": return "bg-red-500/20 text-red-400 border-red-500/30";
      default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };

  const outcomeColor = (result: string) => {
    switch (result) {
      case "recovered": return "text-emerald-400";
      case "stopped": return "text-amber-400";
      case "failed": return "text-red-400";
      default: return "text-blue-400";
    }
  };

  if (loading && cases.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950 text-zinc-400">
        Loading recoveries...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-8 py-5">
        <h1 className="text-xl font-semibold">Recovery Cases</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          All recovery cases with filtering by status, root cause, and batch
        </p>
      </header>

      <div className="px-8 py-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </option>
            ))}
          </select>

          <select
            value={rootCauseFilter}
            onChange={(e) => setRootCauseFilter(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
          >
            {ROOT_CAUSE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r === "all" ? "All root causes" : r.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Filter by batch ID..."
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-blue-500 w-52"
          />

          <span className="text-xs text-zinc-500 ml-auto">
            {pagination.total} total cases
          </span>
        </div>

        {cases.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-400 text-lg">No recovery cases found</p>
            <p className="text-zinc-500 text-sm mt-2">
              Run a simulation from the Home page or adjust your filters
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50">
                    <th className="text-left px-4 py-3 font-medium text-zinc-400">Case ID</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-400">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-zinc-400">Amount</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-400">Method</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-400">Root Cause</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-400">Outcome</th>
                    <th className="text-right px-4 py-3 font-medium text-zinc-400">Attempts</th>
                    <th className="text-right px-4 py-3 font-medium text-zinc-400">Recovery Time</th>
                    <th className="text-right px-4 py-3 font-medium text-zinc-400">When</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr
                      key={c.case_id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/recoveries/${c.case_id}`}
                          className="font-mono text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          {c.case_id}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusColor(c.status)}`}>
                          {c.status}
                        </span>
                        {c.diagnosis?.fallback_used && (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                            Fallback
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-300">
                        {formatAmount(c.original_event.amount)}
                      </td>
                      <td className="px-4 py-3 uppercase text-zinc-400 text-xs">
                        {c.original_event.method}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {c.diagnosis?.root_cause?.replace(/_/g, " ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${outcomeColor(c.outcome.result)}`}>
                          {c.outcome.result}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-400">
                        {c.outcome.total_attempts}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-400">
                        {formatDuration(c.outcome.time_to_recovery_ms || 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500">
                        {formatTime(c.original_event.occurred_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.pages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => fetchCases(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-zinc-500">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <button
                  onClick={() => fetchCases(pagination.page + 1)}
                  disabled={pagination.page >= pagination.pages}
                  className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
