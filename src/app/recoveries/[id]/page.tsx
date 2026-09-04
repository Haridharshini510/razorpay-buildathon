"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface AuditEntry {
  audit_id: string;
  recovery_case_id: string;
  stage: string;
  decision: string;
  reasoning: string;
  confidence?: number;
  ai_used: boolean;
  llm_model?: string;
  latency_ms?: number;
  context?: Record<string, unknown>;
  timestamp: string;
}

interface RecoveryDetail {
  case_id: string;
  batch_id: string | null;
  status: string;
  original_event: {
    payment_id: string;
    order_id: string;
    amount: number;
    currency: string;
    method: string;
    error_code: string;
    error_description: string;
    customer: { email: string; phone: string; name?: string };
    occurred_at: string;
  };
  diagnosis: {
    root_cause: string;
    confidence: number;
    reasoning: string;
    recoverable: boolean;
    suggested_wait_minutes?: number;
    model_used: string;
    fallback_used: boolean;
    diagnosed_at: string;
  } | null;
  interventions: {
    attempt: number;
    action: string;
    method: string;
    delay_minutes?: number;
    reasoning: string;
    result: string;
    result_detail?: string;
    recovered_amount?: number;
    scheduled_at: string;
    executed_at?: string;
  }[];
  stopping_state: {
    retry_count: number;
    nudge_count: number;
    stopped: boolean;
    stop_reason: string | null;
  };
  outcome: {
    result: string;
    recovered_amount?: number;
    time_to_recovery_ms?: number;
    total_attempts: number;
    final_method?: string;
  };
  created_at: string;
  audit_trail: AuditEntry[];
}

const STAGE_ORDER = ["intake", "diagnosis", "stopping_check", "intervention_selection", "execution", "outcome"];

const STAGE_LABELS: Record<string, string> = {
  intake: "Payment Received",
  diagnosis: "Root Cause Diagnosis",
  stopping_check: "Stopping Rules Check",
  intervention_selection: "Intervention Selected",
  execution: "Execution",
  outcome: "Final Outcome",
};

function formatAmount(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function formatDuration(ms: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)} min`;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function RecoveryDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<RecoveryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/recoveries/${id}`);
        if (!res.ok) {
          setError(res.status === 404 ? "Recovery case not found" : "Failed to load");
          return;
        }
        setData(await res.json());
      } catch {
        setError("Failed to load recovery case");
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950 text-zinc-400">
        Loading recovery case...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950">
        <div className="text-center">
          <p className="text-red-400 text-lg">{error || "Not found"}</p>
          <Link href="/recoveries" className="text-blue-400 text-sm mt-2 hover:underline">
            Back to recoveries
          </Link>
        </div>
      </div>
    );
  }

  const statusColor =
    data.outcome.result === "recovered"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      : data.outcome.result === "stopped"
        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
        : data.outcome.result === "failed"
          ? "bg-red-500/20 text-red-400 border-red-500/30"
          : "bg-blue-500/20 text-blue-400 border-blue-500/30";

  const auditEntries = [...data.audit_trail].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-8 py-5">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/recoveries" className="text-zinc-500 hover:text-zinc-300 text-sm">
            ← Recoveries
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold font-mono">{data.case_id}</h1>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${statusColor}`}>
            {data.outcome.result}
          </span>
          {data.diagnosis?.fallback_used && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
              Fallback Mode
            </span>
          )}
        </div>
      </header>

      <div className="px-8 py-6 space-y-6">
        {/* Summary cards */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <InfoCard label="Amount" value={formatAmount(data.original_event.amount)} />
          <InfoCard label="Method" value={data.original_event.method.toUpperCase()} />
          <InfoCard label="Error Code" value={data.original_event.error_code} />
          <InfoCard
            label="Root Cause"
            value={data.diagnosis?.root_cause.replace(/_/g, " ") || "Pending"}
          />
          <InfoCard label="Recovery Time" value={formatDuration(data.outcome.time_to_recovery_ms || 0)} />
        </section>

        {/* Payment details */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm font-medium text-zinc-300 mb-3">Payment Details</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm lg:grid-cols-4">
            <Detail label="Payment ID" value={data.original_event.payment_id} mono />
            <Detail label="Order ID" value={data.original_event.order_id} mono />
            <Detail label="Customer" value={data.original_event.customer.name || data.original_event.customer.email} />
            <Detail label="Phone" value={data.original_event.customer.phone} />
            <Detail label="Error" value={data.original_event.error_description} />
            <Detail label="Occurred At" value={formatTime(data.original_event.occurred_at)} />
            {data.batch_id && <Detail label="Batch" value={data.batch_id} mono link={`/batches/${data.batch_id}`} />}
            <Detail label="Attempts" value={`${data.stopping_state.retry_count} retries, ${data.stopping_state.nudge_count} nudges`} />
          </div>
        </section>

        {/* Diagnosis summary */}
        {data.diagnosis && (
          <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-medium text-zinc-300">AI Diagnosis</h2>
              {data.diagnosis.fallback_used ? (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  Fallback
                </span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  AI
                </span>
              )}
              <span className="text-xs text-zinc-500">
                {(data.diagnosis.confidence * 100).toFixed(0)}% confidence
              </span>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">{data.diagnosis.reasoning}</p>
            <div className="flex gap-4 mt-2 text-xs text-zinc-500">
              <span>Recoverable: {data.diagnosis.recoverable ? "Yes" : "No"}</span>
              {data.diagnosis.suggested_wait_minutes && (
                <span>Suggested wait: {data.diagnosis.suggested_wait_minutes} min</span>
              )}
              <span>Model: {data.diagnosis.model_used}</span>
            </div>
          </section>
        )}

        {/* Recovery Timeline */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm font-medium text-zinc-300 mb-5">Recovery Timeline</h2>

          <div className="relative ml-1">
            {auditEntries.map((entry, i) => {
              const isLast = i === auditEntries.length - 1;
              const isOutcome = entry.stage === "outcome";
              const isSuccess =
                entry.decision === "recovered" || entry.decision === "proceed" || entry.decision === "case_created";
              const isStopped =
                entry.decision === "stopped" ||
                entry.decision === "stopped_after_failure" ||
                entry.decision === "stopped_before_delayed_execution";

              const dotColor = isOutcome
                ? data.outcome.result === "recovered"
                  ? "bg-emerald-500"
                  : data.outcome.result === "stopped"
                    ? "bg-amber-500"
                    : "bg-red-500"
                : isStopped
                  ? "bg-amber-500"
                  : isSuccess
                    ? "bg-emerald-500"
                    : "bg-blue-500";

              return (
                <div key={entry.audit_id} className="relative flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
                    {!isLast && <div className="w-px flex-1 bg-zinc-700 my-1" />}
                  </div>

                  <div className={`pb-6 min-w-0 flex-1 ${isLast ? "pb-0" : ""}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-zinc-200">
                        {STAGE_LABELS[entry.stage] || entry.stage}
                      </span>
                      {entry.ai_used ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          AI
                        </span>
                      ) : entry.stage !== "intake" ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400 border border-zinc-600/30">
                          Rules
                        </span>
                      ) : null}
                      {entry.confidence != null && (
                        <span className="text-[10px] text-zinc-500">
                          {(entry.confidence * 100).toFixed(0)}% confidence
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-600 ml-auto">
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>

                    <p className="text-sm text-zinc-300 mt-0.5">
                      <span className="font-mono text-xs text-zinc-400">{entry.decision}</span>
                    </p>

                    <div className="mt-1.5 rounded bg-zinc-800/60 border border-zinc-700/50 px-3 py-2">
                      <p className="text-sm text-zinc-400 leading-relaxed">{entry.reasoning}</p>
                      {entry.context && Object.keys(entry.context).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {Object.entries(entry.context).map(([k, v]) => (
                            <span
                              key={k}
                              className="text-[11px] font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded"
                            >
                              {k}: {typeof v === "object" ? JSON.stringify(v) : String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Interventions table */}
        {data.interventions.length > 0 && (
          <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-sm font-medium text-zinc-300 mb-3">Intervention Attempts</h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-3 py-2 font-medium text-zinc-400">#</th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-400">Action</th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-400">Method</th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-400">Result</th>
                    <th className="text-left px-3 py-2 font-medium text-zinc-400">Detail</th>
                    <th className="text-right px-3 py-2 font-medium text-zinc-400">Recovered</th>
                  </tr>
                </thead>
                <tbody>
                  {data.interventions.map((iv) => (
                    <tr key={iv.attempt} className="border-b border-zinc-800/50">
                      <td className="px-3 py-2 text-zinc-400">{iv.attempt}</td>
                      <td className="px-3 py-2 text-zinc-300">{iv.action.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2 uppercase text-zinc-400 text-xs">{iv.method}</td>
                      <td className="px-3 py-2">
                        <span className={iv.result === "success" ? "text-emerald-400" : iv.result === "failed" ? "text-red-400" : "text-blue-400"}>
                          {iv.result}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-zinc-500 text-xs max-w-[200px] truncate">
                        {iv.result_detail || "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-400">
                        {iv.recovered_amount ? formatAmount(iv.recovered_amount) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-100 truncate">{value}</p>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: string;
}) {
  return (
    <div className="py-1">
      <span className="text-xs text-zinc-500">{label}: </span>
      {link ? (
        <Link href={link} className={`text-blue-400 hover:text-blue-300 ${mono ? "font-mono text-xs" : ""}`}>
          {value}
        </Link>
      ) : (
        <span className={`text-zinc-300 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
      )}
    </div>
  );
}
