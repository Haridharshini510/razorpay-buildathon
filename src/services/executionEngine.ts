import { InterventionResult } from "./interventionSelector";
import { IRecoveryCase } from "@/models/RecoveryCase";
import { getRazorpayClient } from "@/lib/razorpay";
import { nanoid } from "nanoid";

export interface ExecutionResult {
  success: boolean;
  detail: string;
  new_payment_id?: string;
  payment_link?: string;
  order_id?: string;
  razorpay_response?: any;
}

export async function executeIntervention(
  intervention: InterventionResult,
  recoveryCase: IRecoveryCase
): Promise<ExecutionResult> {
  const customer = recoveryCase.original_event.customer;
  const amount = recoveryCase.original_event.amount;
  const currency = recoveryCase.original_event.currency || "INR";

  if (recoveryCase.original_event.payment_id.startsWith("pay_demo_") ||
      recoveryCase.original_event.payment_id.startsWith("pay_sim_")) {
    return simulateExecution(intervention, recoveryCase);
  }

  try {
    switch (intervention.action) {
      case "immediate_retry":
        return await retryPayment(amount, currency, customer, intervention, recoveryCase);

      case "delayed_retry":
        return await retryPayment(amount, currency, customer, intervention, recoveryCase);

      case "alternate_method":
        return await handleAlternateMethod(amount, currency, customer, intervention, recoveryCase);

      case "payment_link":
        return await createRecoveryPaymentLink(amount, currency, customer, intervention, recoveryCase);

      case "customer_nudge":
        return await sendCustomerNudge(amount, currency, customer, intervention, recoveryCase);

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

export async function createOrder(
  amount: number,
  currency: string,
  method: string,
  recoveryCase: IRecoveryCase
): Promise<{ order_id: string; razorpay_response: any }> {
  const razorpay = getRazorpayClient();
  const receipt = `recovery_${recoveryCase.case_id}_${nanoid(6)}`;

  const order = await razorpay.orders.create({
    amount,
    currency,
    receipt,
    notes: {
      recovery_case_id: recoveryCase.case_id,
      original_order_id: recoveryCase.original_event.order_id,
      recovery_method: method,
    },
  });

  return {
    order_id: order.id,
    razorpay_response: order,
  };
}

async function retryPayment(
  amount: number,
  currency: string,
  customer: { email: string; phone: string; name?: string },
  intervention: InterventionResult,
  recoveryCase: IRecoveryCase
): Promise<ExecutionResult> {
  const method = intervention.method === "same"
    ? recoveryCase.original_event.method
    : intervention.method;

  const { order_id, razorpay_response: orderResponse } = await createOrder(
    amount,
    currency,
    method,
    recoveryCase
  );

  const link = await createPaymentLinkForOrder(
    amount,
    currency,
    customer,
    recoveryCase,
    `Retry payment for order ${recoveryCase.original_event.order_id}`
  );

  return {
    success: true,
    detail: `Retry initiated: new order ${order_id}, payment link sent (${intervention.action} via ${method})`,
    new_payment_id: link.id,
    payment_link: link.short_url,
    order_id,
    razorpay_response: {
      order: orderResponse,
      payment_link: { id: link.id, short_url: link.short_url, status: link.status },
    },
  };
}

async function handleAlternateMethod(
  amount: number,
  currency: string,
  customer: { email: string; phone: string; name?: string },
  intervention: InterventionResult,
  recoveryCase: IRecoveryCase
): Promise<ExecutionResult> {
  const suggestedMethod = intervention.method === "same"
    ? recoveryCase.original_event.method
    : intervention.method;

  const { order_id, razorpay_response: orderResponse } = await createOrder(
    amount,
    currency,
    suggestedMethod,
    recoveryCase
  );

  const link = await createPaymentLinkForOrder(
    amount,
    currency,
    customer,
    recoveryCase,
    `Complete payment for order ${recoveryCase.original_event.order_id} (suggested: ${suggestedMethod})`
  );

  return {
    success: true,
    detail: `Alternate method recovery: order ${order_id}, payment link sent (suggested ${suggestedMethod})`,
    new_payment_id: link.id,
    payment_link: link.short_url,
    order_id,
    razorpay_response: {
      order: orderResponse,
      payment_link: { id: link.id, short_url: link.short_url, status: link.status },
    },
  };
}

async function createRecoveryPaymentLink(
  amount: number,
  currency: string,
  customer: { email: string; phone: string; name?: string },
  intervention: InterventionResult,
  recoveryCase: IRecoveryCase
): Promise<ExecutionResult> {
  const link = await createPaymentLinkForOrder(
    amount,
    currency,
    customer,
    recoveryCase,
    `Payment recovery for order ${recoveryCase.original_event.order_id}`
  );

  return {
    success: true,
    detail: `Payment link created: ${link.short_url} (payment_link via ${intervention.method})`,
    new_payment_id: link.id,
    payment_link: link.short_url,
    razorpay_response: {
      id: link.id,
      short_url: link.short_url,
      status: link.status,
    },
  };
}

async function sendCustomerNudge(
  amount: number,
  currency: string,
  customer: { email: string; phone: string; name?: string },
  intervention: InterventionResult,
  recoveryCase: IRecoveryCase
): Promise<ExecutionResult> {
  const link = await createPaymentLinkForOrder(
    amount,
    currency,
    customer,
    recoveryCase,
    `Your payment of ₹${(amount / 100).toFixed(2)} for order ${recoveryCase.original_event.order_id} is pending`
  );

  return {
    success: true,
    detail: `Customer nudge sent with payment link: ${link.short_url}`,
    new_payment_id: link.id,
    payment_link: link.short_url,
    razorpay_response: {
      id: link.id,
      short_url: link.short_url,
      status: link.status,
    },
  };
}

function simulateExecution(
  intervention: InterventionResult,
  recoveryCase: IRecoveryCase
): ExecutionResult {
  const method = intervention.method === "same"
    ? recoveryCase.original_event.method
    : intervention.method;

  switch (intervention.action) {
    case "immediate_retry":
      return {
        success: true,
        detail: `Retry payment succeeded via ${method} — new payment captured`,
        new_payment_id: `pay_recovered_${recoveryCase.case_id.slice(-6)}`,
        order_id: `order_retry_${recoveryCase.case_id.slice(-6)}`,
      };
    case "delayed_retry":
      return {
        success: true,
        detail: `Delayed retry succeeded via ${method} after cool-off period`,
        new_payment_id: `pay_recovered_${recoveryCase.case_id.slice(-6)}`,
        order_id: `order_retry_${recoveryCase.case_id.slice(-6)}`,
      };
    case "payment_link":
      return {
        success: true,
        detail: `Payment link created and sent to ${recoveryCase.original_event.customer.email} via SMS & email`,
        new_payment_id: `plink_${recoveryCase.case_id.slice(-6)}`,
        payment_link: `https://rzp.io/i/${recoveryCase.case_id.slice(-8)}`,
      };
    case "customer_nudge":
      return {
        success: true,
        detail: `Nudge sent to ${recoveryCase.original_event.customer.name || "customer"} with payment link`,
        new_payment_id: `plink_${recoveryCase.case_id.slice(-6)}`,
        payment_link: `https://rzp.io/i/${recoveryCase.case_id.slice(-8)}`,
      };
    case "alternate_method":
      return {
        success: true,
        detail: `Alternate method payment initiated via ${method}`,
        new_payment_id: `pay_alt_${recoveryCase.case_id.slice(-6)}`,
        order_id: `order_alt_${recoveryCase.case_id.slice(-6)}`,
      };
    case "stop":
      return {
        success: false,
        detail: "Recovery stopped — no further action taken",
      };
    default:
      return { success: false, detail: `Unknown action: ${intervention.action}` };
  }
}

async function createPaymentLinkForOrder(
  amount: number,
  currency: string,
  customer: { email: string; phone: string; name?: string },
  recoveryCase: IRecoveryCase,
  description: string
): Promise<{ id: string; short_url: string; status: string }> {
  const razorpay = getRazorpayClient();
  const referenceId = `recovery_${recoveryCase.case_id}_${nanoid(6)}`;

  const link = await razorpay.paymentLink.create({
    amount,
    currency,
    accept_partial: false,
    reference_id: referenceId,
    description,
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
    notes: {
      recovery_case_id: recoveryCase.case_id,
      original_order_id: recoveryCase.original_event.order_id,
    },
  });

  return { id: link.id, short_url: link.short_url, status: link.status };
}
