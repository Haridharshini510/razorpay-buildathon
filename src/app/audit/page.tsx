"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface AuditEntry {
  audit_id: string;
  recovery_case_id: string;
  batch_id: string | null;
  timestamp: string;
  stage: string;
  decision: string;
  reasoning: string;
  confidence?: number;
  ai_used: boolean;
  llm_model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  latency_ms?: number;
  context?: Record<string, unknown>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const STAGE_OPTIONS = ["all", "intake", "diagnosis", "stopping_check", "intervention_selection", "execution", "outcome"];
const AI_OPTIONS = ["all", "ai", "rules"];

const STAGE_COLORS: Record<string, string> = {
  intake: "bg-zinc-700/50 text-zinc-300 border-zinc-600/30",
  diagnosis: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  stopping_check: "bg-zinc-700/50 text-zinc-300 border-zinc-600/30",
  intervention_selection: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  execution: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  outcome: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

const STAGE_LABELS: Record<string, string> = {
  intake: "Intake",
  diagnosis: "Diagnosis",
  stopping_check: "Stopping Rules",
  intervention_selection: "Intervention",
  execution: "Execution",
  outcome: "Outcome",
};

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 30, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState("all");
  const [aiFilter, setAiFilter] = useState("all");
  const [caseFilter, setCaseFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEntries = useCallback(async (page: number) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (stageFilter !== "all") params.set("stage", stageFilter);
      if (aiFilter === "ai") params.set("ai_used", "true");
      if (aiFilter === "rules") params.set("ai_used", "false");
      if (caseFilter.trim()) params.set("recovery_id", caseFilter.trim());

      const res = await fetch(`/api/audit?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
        setPagination(data.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [stageFilter, aiFilter, caseFilter]);

  useEffect(() => {
    setLoading(true);
    fetchEntries(1);
  }, [fetchEntries]);

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-950 text-zinc-400">
        Loading audit log...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-8 py-5">
        <h1 className="text-xl font-semibold">Audit Log</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Every decision logged — AI vs deterministic clearly tagged
        </p>
      </header>

      <div className="px-8 py-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
          >
            {STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All stages" : STAGE_LABELS[s] || s}
              </option>
            ))}
          </select>

          <select
            value={aiFilter}
            onChange={(e) => setAiFilter(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
          >
            {AI_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a === "all" ? "AI & Rules" : a === "ai" ? "AI only" : "Rules only"}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Filter by case ID..."
            value={caseFilter}
            onChange={(e) => setCaseFilter(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-blue-500 w-52"
          />

          <span className="text-xs text-zinc-500 ml-auto">
            {pagination.total} total entries
          </span>
        </div>

        {entries.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-400 text-lg">No audit entries found</p>
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
                    <th className="text-left px-4 py-3 font-medium text-zinc-400 w-8"></th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-400">Timestamp</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-400">Case</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-400">Stage</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-400">Decision</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-400">Source</th>
                    <th className="text-right px-4 py-3 font-medium text-zinc-400">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const isExpanded = expandedId === entry.audit_id;
                    return (
                      <AuditRow
                        key={entry.audit_id}
                        entry={entry}
                        isExpanded={isExpanded}
                        onToggle={() =>
                          setExpandedId(isExpanded ? null : entry.audit_id)
                        }
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pagination.pages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => fetchEntries(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-zinc-500">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <button
                  onClick={() => fetchEntries(pagination.page + 1)}
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

function AuditRow({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: AuditEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const stageColor = STAGE_COLORS[entry.stage] || "bg-zinc-700/50 text-zinc-300 border-zinc-600/30";

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors cursor-pointer"
      >
        <td className="px-4 py-3 text-zinc-500">
          <span className={`inline-block transition-transform ${isExpanded ? "rotate-90" : ""}`}>
            &#9654;
          </span>
        </td>
        <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
          {formatTime(entry.timestamp)}
        </td>
        <td className="px-4 py-3">
          <Link
            href={`/recoveries/${entry.recovery_case_id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs text-blue-400 hover:text-blue-300"
          >
            {entry.recovery_case_id}
          </Link>
        </td>
        <td className="px-4 py-3">
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${stageColor}`}>
            {STAGE_LABELS[entry.stage] || entry.stage}
          </span>
        </td>
        <td className="px-4 py-3 font-mono text-xs text-zinc-300 max-w-[200px] truncate">
          {entry.decision}
        </td>
        <td className="px-4 py-3 text-center">
          {entry.ai_used ? (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
              AI
            </span>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400 border border-zinc-600/30">
              Rules
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right text-zinc-400">
          {entry.confidence != null ? `${(entry.confidence * 100).toFixed(0)}%` : "—"}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-zinc-900/30">
          <td colSpan={7} className="px-4 py-4">
            <div className="space-y-3 ml-8">
              <div>
                <p className="text-xs font-medium text-zinc-400 mb-1">Reasoning</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{entry.reasoning}</p>
              </div>

              {entry.ai_used && (entry.llm_model || entry.latency_ms != null) && (
                <div className="flex gap-4 text-xs text-zinc-500">
                  {entry.llm_model && <span>Model: {entry.llm_model}</span>}
                  {entry.latency_ms != null && <span>Latency: {entry.latency_ms}ms</span>}
                  {entry.prompt_tokens != null && <span>Tokens: {entry.prompt_tokens} in / {entry.completion_tokens} out</span>}
                </div>
              )}

              {entry.context && Object.keys(entry.context).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-400 mb-1">Context</p>
                  <pre className="text-xs text-zinc-400 bg-zinc-800/60 rounded border border-zinc-700/50 px-3 py-2 overflow-auto max-h-40">
                    {JSON.stringify(entry.context, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
