import { getGeminiClient, isLLMAvailable } from "@/lib/gemini";

export interface DiagnosisInput {
  error_code: string;
  error_description: string;
  method: string;
  amount: number;
  timestamp: string;
}

export interface DiagnosisResult {
  root_cause: string;
  confidence: number;
  reasoning: string;
  recoverable: boolean;
  suggested_wait_minutes?: number;
  model_used: string;
  fallback_used: boolean;
}

const FALLBACK_MAPPING: Record<string, { root_cause: string; recoverable: boolean }> = {
  GATEWAY_ERROR: { root_cause: "bank_server_timeout", recoverable: true },
  BAD_REQUEST_ERROR: { root_cause: "invalid_details", recoverable: false },
  SERVER_ERROR: { root_cause: "internal_error", recoverable: false },
};

const DESCRIPTION_HINTS: [string, { root_cause: string; recoverable: boolean }][] = [
  ["card expired", { root_cause: "card_expired", recoverable: true }],
  ["card has expired", { root_cause: "card_expired", recoverable: true }],
  ["upi", { root_cause: "upi_expired", recoverable: true }],
  ["expired", { root_cause: "upi_expired", recoverable: true }],
  ["insufficient", { root_cause: "insufficient_funds", recoverable: false }],
  ["declined by the bank", { root_cause: "bank_declined", recoverable: false }],
  ["bank server", { root_cause: "bank_server_timeout", recoverable: true }],
  ["not responding", { root_cause: "bank_server_timeout", recoverable: true }],
  ["network", { root_cause: "network_error", recoverable: true }],
  ["rate limit", { root_cause: "rate_limit", recoverable: true }],
];

export function fallbackDiagnosis(input: DiagnosisInput): DiagnosisResult {
  const descLower = input.error_description.toLowerCase();

  for (const [hint, result] of DESCRIPTION_HINTS) {
    if (descLower.includes(hint)) {
      return {
        root_cause: result.root_cause,
        confidence: 0.5,
        reasoning: `Fallback: error description contains "${hint}", mapped to ${result.root_cause}`,
        recoverable: result.recoverable,
        suggested_wait_minutes: result.recoverable ? 15 : undefined,
        model_used: "fallback_rules",
        fallback_used: true,
      };
    }
  }

  const codeMapping = FALLBACK_MAPPING[input.error_code];
  if (codeMapping) {
    return {
      root_cause: codeMapping.root_cause,
      confidence: 0.4,
      reasoning: `Fallback: error code ${input.error_code} mapped to ${codeMapping.root_cause}`,
      recoverable: codeMapping.recoverable,
      suggested_wait_minutes: codeMapping.recoverable ? 15 : undefined,
      model_used: "fallback_rules",
      fallback_used: true,
    };
  }

  return {
    root_cause: "unknown",
    confidence: 0.2,
    reasoning: `Fallback: unrecognized error code ${input.error_code} with description "${input.error_description}"`,
    recoverable: false,
    model_used: "fallback_rules",
    fallback_used: true,
  };
}

const DIAGNOSIS_PROMPT = `You are a payment failure diagnostic engine for an Indian payment gateway (Razorpay).
Analyze the payment failure and determine the root cause.

You MUST respond with valid JSON only, no markdown, no code fences. Match this schema:
{
  "root_cause": string (one of: "bank_server_timeout", "network_error", "insufficient_funds", "card_expired", "upi_expired", "rate_limit", "bank_maintenance", "bank_declined", "invalid_details", "fraud_suspected", "internal_error", "unknown"),
  "confidence": number (0.0 to 1.0),
  "reasoning": string (brief explanation of your diagnosis),
  "recoverable": boolean (whether automatic recovery is possible),
  "suggested_wait_minutes": number or null (if recoverable, how long to wait before retrying)
}

Guidelines:
- Bank/gateway timeouts and network errors are usually transient and recoverable
- Insufficient funds and bank declines are not automatically recoverable
- UPI expiry is recoverable via a new payment link
- Card expiry is recoverable via a new payment link with updated card
- Rate limits are recoverable after a delay
- Consider the payment method and amount when assessing recoverability
- Be conservative with confidence scores`;

export async function diagnose(input: DiagnosisInput): Promise<DiagnosisResult> {
  if (!isLLMAvailable()) {
    return fallbackDiagnosis(input);
  }

  try {
    const client = getGeminiClient();
    const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent(
      `${DIAGNOSIS_PROMPT}

Diagnose this payment failure:
- Error Code: ${input.error_code}
- Error Description: ${input.error_description}
- Payment Method: ${input.method}
- Amount: ₹${(input.amount / 100).toFixed(2)}
- Timestamp: ${input.timestamp}

Respond with JSON only.`
    );

    const responseText = result.response.text();
    const cleaned = responseText.replace(/```json\s*|```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      root_cause: parsed.root_cause || "unknown",
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      reasoning: parsed.reasoning || "AI diagnosis completed",
      recoverable: !!parsed.recoverable,
      suggested_wait_minutes: parsed.suggested_wait_minutes || undefined,
      model_used: "gemini-2.0-flash",
      fallback_used: false,
    };
  } catch {
    return fallbackDiagnosis(input);
  }
}
