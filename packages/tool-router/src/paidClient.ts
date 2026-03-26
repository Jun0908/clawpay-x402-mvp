import { PaymentPayload, PaymentRequirement, SettlementResponse, SignedPayment } from "../../shared/src/types";
import { decodeBase64Json, encodeBase64Json, signPaymentPayload, x402Headers } from "../../shared/src/x402";

export async function requestPaidResource(input: {
  sellerUrl: string;
  task: string;
  sessionId: string;
  providerId: string;
  requestSummary: string;
  buyerId: string;
  buyerSharedSecret: string;
}): Promise<
  | { kind: "payment-required"; requirement: PaymentRequirement }
  | { kind: "success"; answer: unknown; settlement?: SettlementResponse }
> {
  const firstResponse = await fetch(input.sellerUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      task: input.task,
      sessionId: input.sessionId
    })
  });

  if (firstResponse.status === 402) {
    const header = firstResponse.headers.get(x402Headers.required);
    if (!header) {
      throw new Error("Seller returned 402 without PAYMENT-REQUIRED header.");
    }

    return {
      kind: "payment-required",
      requirement: decodeBase64Json<PaymentRequirement>(header)
    };
  }

  const firstPayload = (await firstResponse.json()) as { answer: unknown };
  return {
    kind: "success",
    answer: firstPayload.answer
  };
}

export async function retryWithPayment(input: {
  sellerUrl: string;
  task: string;
  sessionId: string;
  providerId: string;
  requestSummary: string;
  buyerId: string;
  buyerSharedSecret: string;
  requirement: PaymentRequirement;
}): Promise<{ answer: unknown; signedPayment: SignedPayment; settlement?: SettlementResponse }> {
  const payload: PaymentPayload = {
    paymentId: input.requirement.paymentId,
    providerId: input.providerId,
    amountUsd: input.requirement.amountUsd,
    sessionId: input.sessionId,
    buyerId: input.buyerId,
    requestSummary: input.requestSummary,
    timestamp: new Date().toISOString()
  };

  const signedPayment = signPaymentPayload(payload, input.buyerSharedSecret);

  const retriedResponse = await fetch(input.sellerUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [x402Headers.signature]: encodeBase64Json(signedPayment)
    },
    body: JSON.stringify({
      task: input.task,
      sessionId: input.sessionId
    })
  });

  if (!retriedResponse.ok) {
    const details = await retriedResponse.text();
    throw new Error(`Paid retry failed with ${retriedResponse.status}: ${details}`);
  }

  const settlementHeader = retriedResponse.headers.get(x402Headers.response);
  const settlement = settlementHeader
    ? decodeBase64Json<SettlementResponse>(settlementHeader)
    : undefined;

  const responsePayload = (await retriedResponse.json()) as { answer: unknown };

  return {
    answer: responsePayload.answer,
    signedPayment,
    settlement
  };
}
