import { Request, Response, Router } from "express";
import { buildPaymentRequirement, buildSettlementResponse, decodeBase64Json, encodeBase64Json, verifySignedPayment, x402Headers } from "../../shared/src/x402";
import { PaymentRequirement, SignedPayment } from "../../shared/src/types";
import { buildSellerResult, getSellerProvider, sellerProviders } from "./premiumData";

type PendingPayment = {
  requirement: PaymentRequirement;
  createdAt: number;
};

type SellerConfig = {
  buyerSharedSecret: string;
  sellerWalletAddress: string;
};

const pendingPayments = new Map<string, PendingPayment>();

export function createSellerRouter(config: SellerConfig): Router {
  const router = Router();

  router.get("/providers", (_req, res) => {
    res.json({ providers: Object.values(sellerProviders) });
  });

  router.post("/:providerId", (req, res) => {
    void handlePaidRequest(req, res, config);
  });

  return router;
}

async function handlePaidRequest(req: Request, res: Response, config: SellerConfig): Promise<void> {
  const providerId = typeof req.params.providerId === "string" ? req.params.providerId : undefined;
  const provider = providerId ? getSellerProvider(providerId) : undefined;

  if (!provider) {
    res.status(404).json({ error: "Unknown paid provider." });
    return;
  }

  cleanupExpiredPayments();

  const signedPaymentHeader = req.header(x402Headers.signature);
  if (!signedPaymentHeader) {
    const requirement = buildPaymentRequirement({
      providerId: provider.id,
      resource: provider.endpoint,
      description: provider.description,
      amountUsd: provider.priceUsd,
      payTo: config.sellerWalletAddress
    });

    pendingPayments.set(requirement.paymentId, {
      requirement,
      createdAt: Date.now()
    });

    res
      .status(402)
      .setHeader(x402Headers.required, encodeBase64Json(requirement))
      .json({
        error: "Payment required.",
        providerId: provider.id,
        priceUsd: provider.priceUsd
      });
    return;
  }

  let signedPayment: SignedPayment;
  try {
    signedPayment = decodeBase64Json<SignedPayment>(signedPaymentHeader);
  } catch {
    res.status(400).json({ error: "Invalid payment signature header." });
    return;
  }

  const pending = pendingPayments.get(signedPayment.payload.paymentId);
  if (!pending) {
    res.status(402).json({ error: "Payment requirement expired or unknown." });
    return;
  }

  const { requirement } = pending;
  const now = Date.now();
  if (now > Date.parse(requirement.expiresAt)) {
    pendingPayments.delete(requirement.paymentId);
    res.status(402).json({ error: "Payment requirement expired." });
    return;
  }

  if (!verifySignedPayment(signedPayment, config.buyerSharedSecret)) {
    res.status(402).json({ error: "Payment verification failed." });
    return;
  }

  if (
    signedPayment.payload.providerId !== requirement.providerId ||
    signedPayment.payload.amountUsd !== requirement.amountUsd
  ) {
    res.status(402).json({ error: "Payment payload does not match seller requirement." });
    return;
  }

  pendingPayments.delete(requirement.paymentId);

  const task = typeof req.body?.task === "string" ? req.body.task : "Research ExampleCorp";
  const answer = buildSellerResult(provider.id, task);
  const settlement = buildSettlementResponse(requirement);

  res
    .status(200)
    .setHeader(x402Headers.response, encodeBase64Json(settlement))
    .json({
      ok: true,
      paid: true,
      answer
    });
}

function cleanupExpiredPayments(): void {
  const now = Date.now();

  for (const [paymentId, pending] of pendingPayments.entries()) {
    if (now > Date.parse(pending.requirement.expiresAt)) {
      pendingPayments.delete(paymentId);
    }
  }
}
