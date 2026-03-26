import { createHmac, randomUUID } from "node:crypto";
import { PaymentRequirement, PaymentPayload, SettlementResponse, SignedPayment } from "./types";

const REQUIRED_HEADER = "PAYMENT-REQUIRED";
const SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
const RESPONSE_HEADER = "PAYMENT-RESPONSE";

export const x402Headers = {
  required: REQUIRED_HEADER,
  signature: SIGNATURE_HEADER,
  response: RESPONSE_HEADER
} as const;

export function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function decodeBase64Json<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as T;
}

export function buildPaymentRequirement(input: {
  providerId: string;
  resource: string;
  description: string;
  amountUsd: number;
  payTo: string;
  expiresInMs?: number;
}): PaymentRequirement {
  return {
    x402Version: "2",
    paymentId: randomUUID(),
    providerId: input.providerId,
    resource: input.resource,
    description: input.description,
    amountUsd: Number(input.amountUsd.toFixed(2)),
    scheme: "demo-exact",
    network: "demo-local",
    asset: "USD",
    payTo: input.payTo,
    expiresAt: new Date(Date.now() + (input.expiresInMs ?? 60_000)).toISOString()
  };
}

export function signPaymentPayload(payload: PaymentPayload, secret: string): SignedPayment {
  const signature = createHmac("sha256", secret)
    .update(stableStringify(payload))
    .digest("hex");

  return { payload, signature };
}

export function verifySignedPayment(signedPayment: SignedPayment, secret: string): boolean {
  const expectedSignature = createHmac("sha256", secret)
    .update(stableStringify(signedPayment.payload))
    .digest("hex");

  return signedPayment.signature === expectedSignature;
}

export function buildSettlementResponse(requirement: PaymentRequirement): SettlementResponse {
  return {
    paymentId: requirement.paymentId,
    providerId: requirement.providerId,
    amountUsd: requirement.amountUsd,
    status: "settled",
    settledAt: new Date().toISOString(),
    network: "demo-local"
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}
