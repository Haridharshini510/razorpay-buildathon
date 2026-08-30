import { InterventionResult } from "./interventionSelector";
import { IRecoveryCase } from "@/models/RecoveryCase";
import { getRazorpayClient } from "@/lib/razorpay";
import { nanoid } from "nanoid";

export interface ExecutionResult {
  success: boolean;
  detail: string;
  new_payment_id?: string;
  payment_link?: string;
  razorpay_response?: any;
}

export async function executeIntervention(
  intervention: InterventionResult,
  recoveryCase: IRecoveryCase
): Promise<ExecutionResult> {
  const customer = recoveryCase.original_event.customer;
  const amount = recoveryCase.original_event.amount;
  const currency = recoveryCase.original_event.currency || "INR";

  try {
    switch (intervention.action) {
      case "payment_link":
      case "customer_nudge":
      case "alternate_method":
        return await createPaymentLink(amount, currency, customer, intervention, recoveryCase);

      case "immediate_retry":
      case "delayed_retry":
        return await retryViaPaymentLink(amount, currency, customer, intervention, recoveryCase);

      case "stop":
        return {
          success: false,
          detail: "Intervention is 'stop' — no recovery attempted",
        };

      default:
        return {
          success: false,
          detail: `Unknown intervention action: ${intervention.action}`,
        };
    }
  } catch (error: any) {
    return {
      success: false,
      detail: `Razorpay API error: ${error?.error?.description || error?.message || "Unknown error"}`,
    };
  }
}

async function createPaymentLink(
  amount: number,
  currency: string,
  customer: { email: string; phone: string; name?: string },
  intervention: InterventionResult,
  recoveryCase: IRecoveryCase
): Promise<ExecutionResult> {
  const razorpay = getRazorpayClient();
  const referenceId = `recovery_${recoveryCase.case_id}_${nanoid(6)}`;

  const linkPayload: any = {
    amount,
    currency,
    accept_partial: false,
    reference_id: referenceId,
    description: `Payment recovery for order ${recoveryCase.original_event.order_id}`,
    customer: {
      email: customer.email || undefined,
      contact: customer.phone || undefined,
      name: customer.name || undefined,
    },
    notify: {
      sms: !!customer.phone,
      email: !!customer.email,
    },
    reminder_enable: true,
    callback_url: "",
    callback_method: "get",
  };

  if (intervention.action === "alternate_method" && intervention.method !== "same") {
    linkPayload.description += ` (suggested: ${intervention.method})`;
  }

  const link = await razorpay.paymentLink.create(linkPayload);

  return {
    success: true,
    detail: `Payment link created: ${link.short_url} (${intervention.action} via ${intervention.method})`,
    new_payment_id: link.id,
    payment_link: link.short_url,
    razorpay_response: {
      id: link.id,
      short_url: link.short_url,
      status: link.status,
      reference_id: referenceId,
    },
  };
}

async function retryViaPaymentLink(
  amount: number,
  currency: string,
  customer: { email: string; phone: string; name?: string },
  intervention: InterventionResult,
  recoveryCase: IRecoveryCase
): Promise<ExecutionResult> {
  return await createPaymentLink(amount, currency, customer, intervention, recoveryCase);
}
