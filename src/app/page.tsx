"use client";

import { useState, useEffect, useCallback } from "react";

interface AuditEntry {
  audit_id: string;
  recovery_case_id: string;
  stage: string;
  decision: string;
  reasoning: string;
  confidence?: number;
  ai_used: boolean;
  llm_model?: string;
  context?: Record<string, any>;
  timestamp: string;
}

interface CaseData {
  case_id: string;
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
    model_used: string;
    fallback_used: boolean;
  } | null;
  interventions: {
    attempt: number;
    action: string;
    method: string;
    delay_minutes?: number;
    reasoning: string;
    result: string;
    result_detail?: string;
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
}

interface ScenarioMeta {
  label: string;
  description: string;
  expected_path: string;
  payment_id: string;
  amount: number;
  method: string;
}

const STAGE_ORDER = [
  "intake",
  "diagnosis",
  "stopping_check",
  "intervention_selection",
  "execution",
  "outcome",
];

const STAGE_LABELS: Record<string, string> = {
  intake: "Payment Received",
  diagnosis: "Diagnosis",
  stopping_check: "Stopping Rules",
  intervention_selection: "Intervention Selected",
  execution: "Execution",
  outcome: "Outcome",
};

function formatAmount(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function Dashboard() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [cases, setCases] = useState<CaseData[]>([]);
  const [auditMap, setAuditMap] = useState<Record<string, AuditEntry[]>>({});
  const [running, setRunning] = useState(false);
  const [allDone, setAllDone] = useState(false);

  const fetchData = useCallback(async (bid: string) => {
    try {
      const [casesRes, auditRes] = await Promise.all([
        fetch(`/api/recoveries?batch_id=${bid}&limit=100`),
        fetch(`/api/audit?batch_id=${bid}&limit=1000`),
      ]);

      if (casesRes.ok) {
        const casesData = await casesRes.json();
        setCases(casesData.cases);

        const done =
          casesData.cases.length > 0 &&
          casesData.cases.every((c: CaseData) =>
            ["resolved", "stopped", "failed"].includes(c.status)
          );
        if (done) {
          setAllDone(true);
          setRunning(false);
        }
      }

      if (auditRes.ok) {
        const auditData = await auditRes.json();
        const grouped: Record<string, AuditEntry[]> = {};
        for (const entry of auditData.entries) {
          if (!grouped[entry.recovery_case_id])
            grouped[entry.recovery_case_id] = [];
          grouped[entry.recovery_case_id].push(entry);
        }
        setAuditMap(grouped);
      }
    } catch {
      // ignore fetch errors
    }
  }, []);

  useEffect(() => {
    if (!batchId || allDone) return;
    const interval = setInterval(() => fetchData(batchId), 1500);
    return () => clearInterval(interval);
  }, [batchId, allDone, fetchData]);

  async function runDemo() {
    await startSimulation("demo");
  }

  async function runSimulation(count: number = 20) {
    await startSimulation("random", count);
  }

  async function startSimulation(mode: "demo" | "random", count?: number) {
    setRunning(true);
    setAllDone(false);
    setCases([]);
    setAuditMap({});
    setScenarios([]);
    setBatchId(null);

    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, count }),
      });
      if (res.ok) {
        const data = await res.json();
        setBatchId(data.batch_id);
        setScenarios(data.scenarios || []);
      } else {
        setRunning(false);
      }
    } catch {
      setRunning(false);
    }
  }

  function getScenarioForCase(c: CaseData): ScenarioMeta | undefined {
    return scenarios.find((s) => s.payment_id === c.original_event.payment_id);
  }

  const recovered = cases.filter((c) => c.outcome.result === "recovered");
  const stopped = cases.filter((c) => c.outcome.result === "stopped");
  const totalRecovered = recovered.reduce(
    (sum, c) => sum + (c.outcome.recovered_amount || 0),
    0
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Simulate & Recover</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Run failure scenarios and watch the AI agent recover payments
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={runDemo}
              disabled={running}
              className="rounded border border-zinc-700 px-4 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? "Processing..." : "Run Demo (5)"}
            </button>
            <button
              onClick={() => runSimulation(50)}
              disabled={running}
              className="rounded bg-blue-600 px-5 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? "Processing..." : "Simulate 50"}
            </button>
          </div>
        </div>
      </header>

      <main className="px-8 py-6 space-y-6">
        {!batchId && !running && (
          <div className="text-center py-20">
            <p className="text-zinc-400 text-lg">
              AI-powered payment failure recovery
            </p>
            <p className="text-zinc-500 text-sm mt-2">
              &quot;Run Demo&quot; for 5 curated scenarios, or
              &quot;Simulate 50&quot; for randomized failures with varied amounts, methods, and banks
            </p>
          </div>
        )}

        {batchId && cases.length > 0 && (
          <>
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Cases"
                value={`${cases.length}`}
                sub={allDone ? "all complete" : "processing..."}
                accent="text-zinc-100"
              />
              <StatCard
                label="Recovered"
                value={`${recovered.length}`}
                sub={`of ${cases.length}`}
                accent="text-emerald-400"
              />
              <StatCard
                label="Stopped"
                value={`${stopped.length}`}
                sub="non-recoverable"
                accent="text-amber-400"
              />
              <StatCard
                label="Amount Recovered"
                value={formatAmount(totalRecovered)}
                sub={`of ${formatAmount(cases.reduce((s, c) => s + c.original_event.amount, 0))}`}
                accent="text-emerald-400"
              />
            </section>

            <section className="space-y-4">
              {cases.map((c) => {
                const scenario = getScenarioForCase(c);
                const entries = (auditMap[c.case_id] || []).sort(
                  (a, b) =>
                    STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage)
                );
                return (
                  <CaseCard
                    key={c.case_id}
                    caseData={c}
                    scenario={scenario}
                    auditEntries={entries}
                  />
                );
              })}
            </section>
          </>
        )}

        {running && cases.length === 0 && (
          <div className="text-center py-20">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-400" />
            <p className="text-zinc-400 mt-4">
              Starting recovery pipeline...
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function CaseCard({
  caseData,
  scenario,
  auditEntries,
}: {
  caseData: CaseData;
  scenario?: ScenarioMeta;
  auditEntries: AuditEntry[];
}) {
  const status = caseData.outcome.result;
  const statusColor =
    status === "recovered"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      : status === "stopped"
        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
        : status === "failed"
          ? "bg-red-500/20 text-red-400 border-red-500/30"
          : "bg-blue-500/20 text-blue-400 border-blue-500/30";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-semibold text-base">
              {scenario?.label || caseData.diagnosis?.root_cause || "Processing..."}
            </h3>
            <span
              className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${statusColor}`}
            >
              {status === "pending" ? "processing..." : status}
            </span>
            {caseData.diagnosis?.fallback_used && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                Fallback Mode
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            {scenario?.description || caseData.original_event.error_description}
          </p>
          <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
            <span>
              {formatAmount(caseData.original_event.amount)}
            </span>
            <span className="uppercase">
              {caseData.original_event.method}
            </span>
            <span>{caseData.original_event.customer.name}</span>
            <span className="font-mono">
              {caseData.original_event.error_code}
            </span>
          </div>
        </div>
      </div>

      {auditEntries.length > 0 && (
        <div className="border-t border-zinc-800 px-5 py-4">
          <PipelineTimeline entries={auditEntries} caseData={caseData} />
        </div>
      )}
    </div>
  );
}

function PipelineTimeline({
  entries,
  caseData,
}: {
  entries: AuditEntry[];
  caseData: CaseData;
}) {
  const fallbackUsed = caseData.diagnosis?.fallback_used ?? false;
  return (
    <div className="relative ml-1">
      {entries.map((entry, i) => {
        const isLast = i === entries.length - 1;
        const isOutcome = entry.stage === "outcome";
        const isSuccess =
          entry.decision === "recovered" || entry.decision === "proceed" || entry.decision === "case_created";
        const isStopped =
          entry.decision === "stopped" ||
          entry.decision === "stopped_after_failure" ||
          entry.decision === "stopped_before_delayed_execution";

        const dotColor = isOutcome
          ? caseData.outcome.result === "recovered"
            ? "bg-emerald-500"
            : caseData.outcome.result === "stopped"
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
              <div
                className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${dotColor}`}
              />
              {!isLast && (
                <div className="w-px flex-1 bg-zinc-700 my-1" />
              )}
            </div>

            <div className={`pb-5 min-w-0 flex-1 ${isLast ? "pb-0" : ""}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-zinc-200">
                  {STAGE_LABELS[entry.stage] || entry.stage}
                </span>
                {entry.ai_used && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    AI
                  </span>
                )}
                {!entry.ai_used && entry.stage !== "intake" && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400 border border-zinc-600/30">
                    Rules
                  </span>
                )}
                {fallbackUsed && entry.stage === "diagnosis" && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                    Fallback
                  </span>
                )}
                {entry.confidence !== undefined && entry.confidence !== null && (
                  <span className="text-[10px] text-zinc-500">
                    {(entry.confidence * 100).toFixed(0)}% confidence
                  </span>
                )}
              </div>

              <p className="text-sm text-zinc-300 mt-0.5">
                <span className="font-mono text-xs text-zinc-400">
                  {entry.decision}
                </span>
              </p>

              <div className="mt-1.5 rounded bg-zinc-800/60 border border-zinc-700/50 px-3 py-2">
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {entry.reasoning}
                </p>
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
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-4">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>
    </div>
  );
}
