import { DiagnosisResult } from "./diagnosticEngine";
import { getGeminiClient, isLLMAvailable } from "@/lib/gemini";

export interface InterventionContext {
  amount: number;
  method: string;
  attempt_number: number;
  max_attempts: number;
}

export interface InterventionResult {
  action: "immediate_retry" | "delayed_retry" | "alternate_method" | "payment_link" | "customer_nudge" | "stop";
  method: string;
  delay_minutes?: number;
  reasoning: string;
  fallback_action?: string;
  model_used: string;
  fallback_used: boolean;
}

const FALLBACK_INTERVENTIONS: Record<string, Omit<InterventionResult, "model_used" | "fallback_used">> = {
  bank_server_timeout: {
    action: "delayed_retry",
    method: "same",
    delay_minutes: 15,
    reasoning: "Bank timeout is likely transient. Retry after 15 minutes.",
  },
  network_error: {
    action: "immediate_retry",
    method: "same",
    reasoning: "Network error is transient. Immediate retry likely to succeed.",
  },
  upi_expired: {
    action: "payment_link",
    method: "upi",
    reasoning: "UPI collect request expired. Send new payment link for customer to initiate.",
  },
  card_expired: {
    action: "payment_link",
    method: "card",
    reasoning: "Card expired. Customer needs to enter new card details via payment link.",
  },
  rate_limit: {
    action: "delayed_retry",
    method: "same",
    delay_minutes: 30,
    reasoning: "Rate limited by bank. Wait 30 minutes before retrying.",
  },
  bank_maintenance: {
    action: "alternate_method",
    method: "card",
    reasoning: "Bank under maintenance. Suggest alternate payment method.",
  },
  insufficient_funds: {
    action: "customer_nudge",
    method: "same",
    reasoning: "Insufficient funds — cannot retry automatically. Nudge customer to add funds and retry.",
  },
  bank_declined: {
    action: "alternate_method",
    method: "upi",
    reasoning: "Bank declined the transaction. Suggest alternate method.",
  },
};

export function fallbackIntervention(
  diagnosis: DiagnosisResult,
  context: InterventionContext
): InterventionResult {
  const mapping = FALLBACK_INTERVENTIONS[diagnosis.root_cause];

  if (mapping) {
    const method = mapping.method === "same" ? context.method : mapping.method;
    return {
      ...mapping,
      method,
      model_used: "fallback_rules",
      fallback_used: true,
    };
  }

  return {
    action: "payment_link",
    method: context.method,
    reasoning: `Unknown root cause "${diagnosis.root_cause}". Defaulting to payment link for customer to retry manually.`,
    model_used: "fallback_rules",
    fallback_used: true,
  };
}

const INTERVENTION_PROMPT = `You are a payment recovery strategy engine for an Indian payment gateway (Razorpay).
Given a diagnosis of a payment failure, select the optimal intervention strategy.

You MUST respond with valid JSON only, no markdown, no code fences. Match this schema:
{
  "action": string (one of: "immediate_retry", "delayed_retry", "alternate_method", "payment_link", "customer_nudge", "stop"),
  "method": string (payment method to use: "upi", "card", "netbanking", "wallet", or keep original),
  "delay_minutes": number or null (wait time before executing, if delayed_retry),
  "reasoning": string (brief explanation of why this intervention was chosen)
}

Intervention types:
- immediate_retry: Retry the same payment immediately (good for transient errors)
- delayed_retry: Retry after a delay (good for timeouts, rate limits)
- alternate_method: Suggest a different payment method (good for method-specific failures)
- payment_link: Send a new payment link to customer (good for expired sessions)
- customer_nudge: Notify customer to take action (good for insufficient funds)
- stop: Do not attempt recovery (good for fraud, permanent failures)

Guidelines:
- Consider the attempt number — escalate strategy on later attempts
- High-value transactions (>₹10,000) should prefer safer methods
- UPI failures on retry should consider payment_link
- After 2+ failed retries, prefer alternate_method or payment_link
- Be conservative — don't annoy customers with too many nudges`;

export async function selectIntervention(
  diagnosis: DiagnosisResult,
  context: InterventionContext
): Promise<InterventionResult> {
  if (!isLLMAvailable()) {
    return fallbackIntervention(diagnosis, context);
  }

  try {
    const client = getGeminiClient();
    const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent(
      `${INTERVENTION_PROMPT}

Select an intervention for this recovery case:

Diagnosis:
- Root Cause: ${diagnosis.root_cause}
- Confidence: ${(diagnosis.confidence * 100).toFixed(0)}%
- Recoverable: ${diagnosis.recoverable}
- Reasoning: ${diagnosis.reasoning}

Context:
- Amount: ₹${(context.amount / 100).toFixed(2)}
- Payment Method: ${context.method}
- Attempt #${context.attempt_number} of ${context.max_attempts}
${diagnosis.suggested_wait_minutes ? `- Suggested Wait: ${diagnosis.suggested_wait_minutes} minutes` : ""}

Respond with JSON only.`
    );

    const responseText = result.response.text();
    const cleaned = responseText.replace(/```json\s*|```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const validActions = ["immediate_retry", "delayed_retry", "alternate_method", "payment_link", "customer_nudge", "stop"];
    const action = validActions.includes(parsed.action) ? parsed.action : "payment_link";

    return {
      action,
      method: parsed.method || context.method,
      delay_minutes: parsed.delay_minutes || undefined,
      reasoning: parsed.reasoning || "AI-selected intervention",
      model_used: "gemini-2.0-flash",
      fallback_used: false,
    };
  } catch {
    return fallbackIntervention(diagnosis, context);
  }
}
